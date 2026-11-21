package mx.pokeisaac.port;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.InetSocketAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Relay de cooperativo (mismo protocolo que el servidor del juego original):
 *   cliente -> servidor: [evento, datos, idAck?]  eventos: sub, unsub, b, track, untrack
 *   servidor -> cliente: [evento, datos] | ["__ack", idAck, respuesta]  eventos: p, b
 * Es un simple "pub/sub" por canal; la lógica del juego la lleva el teléfono anfitrión.
 */
class RelayServer extends WebSocketServer {
    private static final int MAX_PER_ROOM = 12;
    private static final Pattern ROOM = Pattern.compile("^pokeisaac:room:([A-Z0-9]+)");

    static class Presence { WebSocket ws; JSONObject meta; Presence(WebSocket w, JSONObject m) { ws = w; meta = m; } }
    static class Topic { final Set<WebSocket> subs = new HashSet<>(); final Map<String, Presence> pres = new LinkedHashMap<>(); }
    static class Client { String room; final Set<String> topics = new HashSet<>(); }
    static class RoomInfo { String code, name; int players; boolean started; }

    private final Map<String, Topic> topics = new HashMap<>();
    private final CountDownLatch started = new CountDownLatch(1);
    private volatile boolean failed;

    RelayServer(int port) { super(new InetSocketAddress(port)); }

    boolean awaitStarted(long ms) throws InterruptedException { return started.await(ms, TimeUnit.MILLISECONDS) && !failed; }

    @Override public void onStart() { started.countDown(); }

    private static String roomOf(String t) {
        Matcher m = ROOM.matcher(t == null ? "" : t);
        return m.find() ? m.group(1) : "";
    }

    @Override
    public synchronized void onOpen(WebSocket ws, ClientHandshake hs) {
        String room = "";
        try {
            String q = new URI("ws://x" + hs.getResourceDescriptor()).getQuery();
            if (q != null) for (String kv : q.split("&")) if (kv.startsWith("room=")) room = kv.substring(5).toUpperCase();
        } catch (Exception ignored) { }
        int n = 0;
        for (WebSocket o : getConnections()) {
            Client c = o.getAttachment();
            if (c != null && room.equals(c.room)) n++;
        }
        if (n >= MAX_PER_ROOM) { ws.close(1013, "lleno"); return; }
        Client c = new Client();
        c.room = room;
        ws.setAttachment(c);
    }

    @Override
    public synchronized void onMessage(WebSocket ws, String raw) {
        Client c = ws.getAttachment();
        if (c == null) return;
        try {
            JSONArray m = new JSONArray(raw);
            String ev = m.optString(0);
            JSONObject d = m.optJSONObject(1);
            if (d == null) return;
            String t = d.optString("t", null);
            if (t == null || !roomOf(t).equals(c.room)) return;
            Topic x = topics.get(t);
            if (x == null) { x = new Topic(); topics.put(t, x); }
            switch (ev) {
                case "sub": {
                    x.subs.add(ws); c.topics.add(t);
                    if (m.length() > 2 && !m.isNull(2)) {
                        JSONObject ok = new JSONObject(); ok.put("ok", true);
                        send(ws, new JSONArray().put("__ack").put(m.get(2)).put(ok));
                    }
                    send(ws, presenceMsg(t, x));
                    break;
                }
                case "unsub": {
                    x.subs.remove(ws); c.topics.remove(t);
                    if (dropPresence(x, ws)) pushPresence(t, x);
                    gc(t, x);
                    break;
                }
                case "b": {
                    JSONObject o = new JSONObject();
                    o.put("t", t); o.put("e", d.opt("e")); o.put("p", d.opt("p"));
                    String out = new JSONArray().put("b").put(o).toString();
                    for (WebSocket s : x.subs) if (s != ws && s.isOpen()) s.send(out);
                    break;
                }
                case "track": {
                    String k = d.optString("k", null);
                    if (k == null) return;
                    JSONObject meta = d.optJSONObject("m");
                    x.pres.put(k, new Presence(ws, meta == null ? new JSONObject() : meta));
                    pushPresence(t, x);
                    break;
                }
                case "untrack": {
                    Presence p = x.pres.get(d.optString("k", ""));
                    if (p != null && p.ws == ws) { x.pres.remove(d.optString("k", "")); pushPresence(t, x); }
                    break;
                }
                default:
            }
        } catch (Exception ignored) { }
    }

    @Override
    public synchronized void onClose(WebSocket ws, int code, String reason, boolean remote) {
        Client c = ws.getAttachment();
        if (c == null) return;
        for (String t : c.topics) {
            Topic x = topics.get(t);
            if (x == null) continue;
            x.subs.remove(ws);
            try { if (dropPresence(x, ws)) pushPresence(t, x); } catch (Exception ignored) { }
            gc(t, x);
        }
        c.topics.clear();
    }

    @Override
    public void onError(WebSocket ws, Exception ex) {
        if (ws == null) { failed = true; started.countDown(); }
    }

    private boolean dropPresence(Topic x, WebSocket ws) {
        boolean ch = false;
        for (Iterator<Presence> it = x.pres.values().iterator(); it.hasNext(); ) {
            if (it.next().ws == ws) { it.remove(); ch = true; }
        }
        return ch;
    }

    private void gc(String t, Topic x) { if (x.subs.isEmpty() && x.pres.isEmpty()) topics.remove(t); }

    private JSONArray presenceMsg(String t, Topic x) throws Exception {
        JSONObject s = new JSONObject();
        for (Map.Entry<String, Presence> e : x.pres.entrySet()) s.put(e.getKey(), new JSONArray().put(e.getValue().meta));
        JSONObject o = new JSONObject();
        o.put("t", t); o.put("s", s);
        return new JSONArray().put("p").put(o);
    }

    private void pushPresence(String t, Topic x) throws Exception {
        String out = presenceMsg(t, x).toString();
        for (WebSocket s : x.subs) if (s.isOpen()) s.send(out);
    }

    private static void send(WebSocket ws, JSONArray a) { if (ws.isOpen()) ws.send(a.toString()); }

    /** Salas con anfitrión presente (canal principal "pokeisaac:room:CODE"). */
    synchronized List<RoomInfo> hostedRooms() {
        List<RoomInfo> out = new ArrayList<>();
        for (Map.Entry<String, Topic> e : topics.entrySet()) {
            String t = e.getKey();
            if (!t.matches("^pokeisaac:room:[A-Z0-9]+$")) continue;
            String host = null; int players = 0; boolean started = false;
            for (Presence p : e.getValue().pres.values()) {
                if (p.meta.optBoolean("dedicated")) continue;
                players++;
                if (p.meta.optBoolean("host")) { host = p.meta.optString("name", "Sala"); started = p.meta.optBoolean("started"); }
            }
            if (host == null) continue;
            RoomInfo r = new RoomInfo();
            r.code = roomOf(t); r.name = host; r.players = players; r.started = started;
            out.add(r);
        }
        return out;
    }
}
