package mx.pokeisaac.port;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Contenedor de PokéIsaac: carga el juego desde los assets del APK (sin internet)
 * y expone window.PiAndroid (salir, abrir enlaces, el cooperativo por wifi y el actualizador).
 * La pantalla va a su frecuencia máxima (90/120/144 Hz) si el teléfono la tiene.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html?app=android&packs=assets/";

    private WebView web;
    private LanManager lan;
    private Updater updater;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF1B1528);
        setContentView(web);
        hideSystemUi();
        maxRefreshRate();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " PokeIsaacAndroid");

        updater = new Updater(this, web);   // antes de cargar: decide de dónde sale cada archivo del juego
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WwwHandler(getAssets(), updater))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return loader.shouldInterceptRequest(u);
                // Sin internet: cualquier otra petición se corta al instante.
                return new WebResourceResponse("text/plain", "utf-8", 404, "Offline",
                        new HashMap<>(), new java.io.ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());

        lan = new LanManager(this, web);
        web.addJavascriptInterface(new Bridge(), "PiAndroid");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        web.postDelayed(() -> updater.check(false), 5000);   // busca actualizaciones al abrir (sin internet, nada)
    }

    /** Pide a Android la frecuencia de pantalla más alta (sin esto muchos teléfonos dejan la app a 60 Hz). */
    @SuppressWarnings("deprecation")
    private void maxRefreshRate() {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            Display d = Build.VERSION.SDK_INT >= 30 ? getDisplay() : getWindowManager().getDefaultDisplay();
            if (d == null) return;
            Display.Mode cur = d.getMode(), best = cur;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                        && m.getRefreshRate() > best.getRefreshRate()) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            lp.preferredRefreshRate = best.getRefreshRate();
            getWindow().setAttributes(lp);
        } catch (Exception ignored) {
        }
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        lan.shutdown();
        web.destroy();
        super.onDestroy();
    }

    /** Atrás = tecla Escape del juego (pausa / volver). */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "(function(){var o={key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true};" +
                        "window.dispatchEvent(new KeyboardEvent('keydown',o));" +
                        "setTimeout(function(){window.dispatchEvent(new KeyboardEvent('keyup',o));},60);})()", null);
    }

    /** Todo es local: el juego no abre páginas de fuera (Discord, Ko-fi, web…). Los enlaces no hacen nada. */
    void openExternal(String url) {
    }

    /** window.PiAndroid */
    class Bridge {
        @JavascriptInterface public void quit() { runOnUiThread(MainActivity.this::finishAndRemoveTask); }
        @JavascriptInterface public void openUrl(String url) { runOnUiThread(() -> openExternal(url)); }
        @JavascriptInterface public String lanConnect(String room) { return lan.connect(room); }
        @JavascriptInterface public void lanSend(String id, String msg) { lan.send(id, msg); }
        @JavascriptInterface public void lanClose(String id) { lan.close(id); }
        @JavascriptInterface public String lanRooms() { return lan.roomsJson(); }
        @JavascriptInterface public String lanInfo() { return lan.infoJson(); }
        @JavascriptInterface public String updInfo() { return updater.info(); }
        @JavascriptInterface public void updCheck() { runOnUiThread(() -> updater.check(true)); }
        @JavascriptInterface public void updHistory() { updater.history(); }
        @JavascriptInterface public void updReset() { updater.reset(); }
        @JavascriptInterface public void updBooted() { updater.booted(); }
        @JavascriptInterface public float refreshRate() {
            try { return (Build.VERSION.SDK_INT >= 30 ? getDisplay() : getWindowManager().getDefaultDisplay()).getRefreshRate(); }
            catch (Exception e) { return 60f; }
        }
    }

    /** Sirve assets/www/ del APK; los archivos que bajó el actualizador van primero. */
    static class WwwHandler implements WebViewAssetLoader.PathHandler {
        private final AssetManager am;
        private final Updater upd;
        private static final Map<String, String> MIME = new HashMap<>();
        static {
            MIME.put("html", "text/html"); MIME.put("js", "application/javascript"); MIME.put("css", "text/css");
            MIME.put("json", "application/json"); MIME.put("png", "image/png"); MIME.put("jpg", "image/jpeg");
            MIME.put("jpeg", "image/jpeg"); MIME.put("gif", "image/gif"); MIME.put("svg", "image/svg+xml");
            MIME.put("ico", "image/x-icon"); MIME.put("webp", "image/webp"); MIME.put("ogg", "audio/ogg");
            MIME.put("mp3", "audio/mpeg"); MIME.put("wav", "audio/wav"); MIME.put("woff2", "font/woff2");
            MIME.put("woff", "font/woff"); MIME.put("ttf", "font/ttf"); MIME.put("txt", "text/plain");
            MIME.put("xml", "text/xml"); MIME.put("webmanifest", "application/manifest+json");
            MIME.put("pack", "application/octet-stream");
        }

        WwwHandler(AssetManager am, Updater upd) { this.am = am; this.upd = upd; }

        @Override
        public WebResourceResponse handle(@NonNull String path) {
            if (path.isEmpty() || path.endsWith("/")) path += "index.html";
            if (path.contains("..")) return null;
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            try {
                if (upd != null && upd.isRemoved(path)) throw new IOException("ya no existe");
                java.io.File f = upd == null ? null : upd.overlayFile(path);
                InputStream in = f != null ? new java.io.FileInputStream(f) : am.open("www/" + path, AssetManager.ACCESS_STREAMING);
                WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Access-Control-Allow-Origin", "*");
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        new HashMap<>(), new java.io.ByteArrayInputStream(new byte[0]));
            }
        }
    }
}
