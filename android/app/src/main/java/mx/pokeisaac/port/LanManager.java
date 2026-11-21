package mx.pokeisaac.port;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Cooperativo por wifi:
 *  - Descubre salas escuchando anuncios UDP (puerto 47811) de otros teléfonos.
 *  - Al crear sala arranca un RelayServer local (WebSocket, puerto 8787+) y lo anuncia.
 *  - Conecta el juego (JS) con el relay correspondiente a través del puente nativo.
 */
class LanManager {
    private static final String TAG = "PiLan";
    static final int DISCOVERY_PORT = 47811;
    static final int RELAY_PORT = 8787;
    private static final String MAGIC = "PIROOM1";

    private final Context ctx;
    private final WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final String instanceId = UUID.randomUUID().toString().substring(0, 8);

    private final Map<String, Found> found = new ConcurrentHashMap<>();
    /** Último anfitrión al que nos conectamos por sala (para reconectar a mitad de partida). */
    private final Map<String, Found> sticky = new ConcurrentHashMap<>();
    private final Map<String, Conn> conns = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger();

    private RelayServer server;
    private int serverPort = -1;
    private volatile boolean running = true;
    private DatagramSocket udp;
    private WifiManager.MulticastLock mlock;

    static class Found {
        String code, ip, name; int port, players; long seen; boolean started;
    }

    LanManager(Context ctx, WebView web) {
        this.ctx = ctx.getApplicationContext();
        this.web = web;
        try {
            WifiManager wm = (WifiManager) this.ctx.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                mlock = wm.createMulticastLock("pokeisaac-lan");
                mlock.setReferenceCounted(false);
                mlock.acquire();
            }
        } catch (Exception e) { Log.w(TAG, "multicast lock", e); }
        pool.execute(this::listenLoop);
        pool.execute(this::beaconLoop);
    }

    // ---------------------------------------------------------------- descubrimiento

    private void listenLoop() {
        try {
            udp = new DatagramSocket(null);
            udp.setReuseAddress(true);
            udp.setBroadcast(true);
            udp.bind(new java.net.InetSocketAddress(DISCOVERY_PORT));
            byte[] buf = new byte[1024];
            while (running) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                udp.receive(p);
                String s = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                String[] f = s.split("\\|", -1);
                if (f.length < 7 || !MAGIC.equals(f[0]) || instanceId.equals(f[1])) continue;
                Found r = new Found();
                r.code = f[2];
                r.port = parseInt(f[3], RELAY_PORT);
                r.players = parseInt(f[4], 1);
                r.started = "1".equals(f[5]);
                r.name = f[6];
                r.ip = p.getAddress().getHostAddress();
                r.seen = System.currentTimeMillis();
                found.put(r.code, r);
            }
        } catch (Exception e) {
            if (running) Log.w(TAG, "listen", e);
        }
    }

    private void beaconLoop() {
        while (running) {
            try {
                Thread.sleep(1000);
                RelayServer srv = server;
                if (srv == null) continue;
                List<RelayServer.RoomInfo> rooms = srv.hostedRooms();
                if (rooms.isEmpty()) continue;
                List<InetAddress> targets = broadcastTargets();
                try (DatagramSocket out = new DatagramSocket()) {
                    out.setBroadcast(true);
                    for (RelayServer.RoomInfo r : rooms) {
                        String msg = MAGIC + "|" + instanceId + "|" + r.code + "|" + serverPort + "|" + r.players + "|"
                                + (r.started ? "1" : "0") + "|" + r.name.replace("|", " ");
                        byte[] b = msg.getBytes(StandardCharsets.UTF_8);
                        for (InetAddress a : targets) {
                            try { out.send(new DatagramPacket(b, b.length, a, DISCOVERY_PORT)); } catch (Exception ignored) { }
                        }
                    }
                }
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                Log.w(TAG, "beacon", e);
            }
        }
    }

    /** 255.255.255.255 + la dirección de broadcast de cada interfaz (wifi y punto de acceso). */
    private static List<InetAddress> broadcastTargets() {
        List<InetAddress> out = new ArrayList<>();
        try { out.add(InetAddress.getByName("255.255.255.255")); } catch (Exception ignored) { }
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress b = ia.getBroadcast();
                    if (b != null && !out.contains(b)) out.add(b);
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    private static List<String> localIps() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof java.net.Inet4Address) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    private Found lookup(String code) {
        Found f = found.get(code);
        return f != null && System.currentTimeMillis() - f.seen < 5000 ? f : null;
    }

    String roomsJson() {
        JSONArray a = new JSONArray();
        long now = System.currentTimeMillis();
        for (Found f : found.values()) {
            if (now - f.seen > 5000 || f.started) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("code", f.code); o.put("name", f.name); o.put("players", f.players); o.put("ip", f.ip);
                a.put(o);
            } catch (Exception ignored) { }
        }
        return a.toString();
    }

    String infoJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("ips", new JSONArray(localIps()));
            o.put("port", serverPort);
            o.put("hosting", server != null);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    // ---------------------------------------------------------------- servidor local

    private synchronized int ensureServer() {
        if (server != null) return serverPort;
        for (int port = RELAY_PORT; port < RELAY_PORT + 10; port++) {
            try {
                RelayServer s = new RelayServer(port);
                s.setReuseAddr(true);
                s.setConnectionLostTimeout(15);
                s.start();
                if (s.awaitStarted(3000)) {
                    server = s; serverPort = port;
                    Log.i(TAG, "relay en puerto " + port);
                    return port;
                }
                try { s.stop(200); } catch (Exception ignored) { }
            } catch (Exception e) {
                Log.w(TAG, "puerto " + port, e);
            }
        }
        return -1;
    }

    // ---------------------------------------------------------------- conexiones del juego

    class Conn extends WebSocketClient {
        final String id;
        volatile boolean closedByJs;
        Conn(String id, URI uri) { super(uri); this.id = id; setConnectionLostTimeout(15); setTcpNoDelay(true); }
        @Override public void onOpen(ServerHandshake h) { emit(id, "open", null); }
        @Override public void onMessage(String m) { emit(id, "msg", m); }
        @Override public void onClose(int code, String reason, boolean remote) {
            conns.remove(id);
            if (!closedByJs) emit(id, "close", reason == null ? "" : reason);
        }
        @Override public void onError(Exception e) { emit(id, "error", String.valueOf(e.getMessage())); }
    }

    String connect(final String room) {
        final String id = String.valueOf(seq.incrementAndGet());
        pool.execute(() -> {
            try {
                String code = room == null ? "" : room.trim().toUpperCase();
                // ¿La sala ya está anunciada en la wifi? Si no, esperamos un poco a oír el anuncio.
                Found f = lookup(code);
                for (int i = 0; f == null && i < 12 && running; i++) { Thread.sleep(200); f = lookup(code); }
                String host; int port;
                if (f == null) {
                    Found st = sticky.get(code);
                    if (st != null && System.currentTimeMillis() - st.seen < 30 * 60 * 1000L) f = st;
                }
                if (f != null) { host = f.ip; port = f.port; sticky.put(code, f); }
                else {
                    // Nadie la anuncia: este teléfono es el anfitrión.
                    port = ensureServer();
                    host = "127.0.0.1";
                    if (port < 0) { emit(id, "error", "server"); emit(id, "close", "server"); return; }
                }
                Conn c = new Conn(id, new URI("ws://" + host + ":" + port + "/?room=" + code));
                conns.put(id, c);
                c.connect();
            } catch (Exception e) {
                Log.w(TAG, "connect", e);
                emit(id, "error", String.valueOf(e.getMessage()));
                emit(id, "close", "error");
            }
        });
        return id;
    }

    void send(String id, String msg) {
        Conn c = conns.get(id);
        if (c != null && c.isOpen()) {
            try { c.send(msg); } catch (Exception ignored) { }
        }
    }

    void close(String id) {
        Conn c = conns.remove(id);
        if (c != null) {
            c.closedByJs = true;
            pool.execute(() -> { try { c.close(); } catch (Exception ignored) { } });
        }
    }

    private void emit(String id, String kind, String data) {
        final String js = "window.__piLanEvent&&window.__piLanEvent(" + JSONObject.quote(id) + "," + JSONObject.quote(kind) + ","
                + (data == null ? "null" : JSONObject.quote(data)) + ")";
        ui.post(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) { } });
    }

    void shutdown() {
        running = false;
        for (Conn c : conns.values()) { c.closedByJs = true; try { c.close(); } catch (Exception ignored) { } }
        conns.clear();
        try { if (udp != null) udp.close(); } catch (Exception ignored) { }
        try { if (server != null) server.stop(300); } catch (Exception ignored) { }
        try { if (mlock != null && mlock.isHeld()) mlock.release(); } catch (Exception ignored) { }
        pool.shutdownNow();
    }

    private static int parseInt(String s, int d) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return d; }
    }
}
