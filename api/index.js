import express from "express";
import crypto from "crypto";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

const { MELI_CLIENT_ID, MELI_REDIRECT_URI } = process.env;

const buildAuthUrl = (state) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: MELI_CLIENT_ID || "",
    redirect_uri: MELI_REDIRECT_URI || "",
    state,
  });

  return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
};

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "Mercado Livre notification server is running",
    nodeVersion: process.version,
    endpoints: {
      login: "/auth/login",
      authCallback: "/api/auth/callback",
      notification: "/api/notification",
    },
  });
});

/**
 * Rota para iniciar OAuth no Mercado Livre
 */
app.get("/auth/login", (req, res) => {
  if (!MELI_CLIENT_ID || !MELI_REDIRECT_URI) {
    return res.status(500).json({
      error:
        "Missing MELI_CLIENT_ID or MELI_REDIRECT_URI in environment variables",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 5 * 60 * 1000, // 5 minutos
  });

  const authUrl = buildAuthUrl(state);

  return res.redirect(authUrl);
});

/**
 * Callback OAuth do Mercado Livre
 * Essa é a rota que o Mercado Livre redireciona após autenticação
 */
app.get("/api/auth/callback", async (req, res) => {
  try {
    console.log("========== AUTH CALLBACK ==========");
    console.log("Query params:", req.query);
    console.log("Headers:", req.headers);

    const { code, state, error, error_description } = req.query;

    const storedState = req.cookies?.oauth_state;

    if (!storedState || !state || storedState !== state) {
      return res.status(403).json({
        success: false,
        error: "Invalid or missing state parameter (possível ataque CSRF)",
      });
    }

    res.clearCookie("oauth_state");

    if (error) {
      return res.status(400).json({
        success: false,
        error,
        error_description,
      });
    }

    return res.status(200).json({
      success: true,
      message: "OAuth callback received successfully",
      received: {
        code: code || null,
        state: state || null,
      },
      note: "Use this code to exchange for access_token in the next step",
    });
  } catch (err) {
    console.error("Error in auth callback:", err);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * Webhook / Notification callback do Mercado Livre
 * Essa é a URL que você cadastra nas notificações
 */
app.post("/api/notification", async (req, res) => {
  try {
    console.log("========== MERCADO LIVRE NOTIFICATION ==========");
    console.log("Method:", req.method);
    console.log("Headers:", req.headers);
    console.log("Query params:", req.query);
    console.log("Body:", req.body);

    return res.status(200).json({
      success: true,
      message: "Notification received successfully",
      receivedAt: new Date().toISOString(),
      body: req.body,
      query: req.query,
    });
  } catch (err) {
    console.error("Error processing notification:", err);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * Algumas integrações/testes também podem bater GET na URL
 * então deixei isso aqui para debug
 */
app.get("/api/notification", (req, res) => {
  console.log("========== MERCADO LIVRE NOTIFICATION (GET) ==========");
  console.log("Headers:", req.headers);
  console.log("Query params:", req.query);

  return res.status(200).json({
    success: true,
    message: "Notification endpoint is available",
    method: "GET",
    query: req.query,
  });
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
