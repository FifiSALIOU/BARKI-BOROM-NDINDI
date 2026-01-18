import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoImage from "../assets/logo.png";
import { Headphones, Shield, Clock, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

interface LoginPageProps {
  onLogin: (token: string) => void;
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [logoAnimated, setLogoAnimated] = useState<boolean>(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Animation initiale du logo
  useEffect(() => {
    const timer = setTimeout(() => {
      setLogoAnimated(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  
  // Récupérer les paramètres de redirection depuis l'URL
  const redirectPath = searchParams.get("redirect") || "/dashboard";
  const ticketId = searchParams.get("ticket");
  const action = searchParams.get("action");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (loading) return;
    setLoading(true);
    try {
      console.log("Connexion: démarrage");
      const base = "http://localhost:8000";
      const body = new URLSearchParams();
      body.append("username", username);
      body.append("password", password);
      body.append("grant_type", "password");
      body.append("scope", "");

      // Créer un AbortController pour gérer le timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout de 30 secondes

      let res;
      try {
        res = await fetch(base + "/auth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("La requête a pris trop de temps. Vérifiez que le backend est accessible.");
        }
        throw fetchError;
      }
      console.log("Réponse /auth/token:", res.status, res.statusText);

      if (!res.ok) {
        let errorMessage = "Identifiants invalides";
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {
          // Si la réponse n'est pas du JSON, utiliser le message par défaut
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      
      // Récupérer les infos de l'utilisateur pour connaître son rôle
      try {
        const userController = new AbortController();
        const userTimeoutId = setTimeout(() => userController.abort(), 5000); // Timeout de 5 secondes
        
        let userRes;
        try {
          userRes = await fetch(base + "/auth/me", {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
            },
            signal: userController.signal,
          });
          clearTimeout(userTimeoutId);
        } catch (fetchError: any) {
          clearTimeout(userTimeoutId);
          if (fetchError.name === 'AbortError') {
            console.warn("Timeout lors de la récupération des infos utilisateur");
            throw fetchError;
          }
          throw fetchError;
        }
        
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.role && userData.role.name) {
            localStorage.setItem("userRole", userData.role.name);
            console.log("Rôle utilisateur:", userData.role.name); // Debug
          }
        }
      } catch (err) {
        console.error("Erreur récupération infos utilisateur:", err);
        // Ne pas bloquer la connexion si la récupération du rôle échoue
      }
      
      onLogin(data.access_token);
      
      // Construire l'URL de redirection avec les paramètres préservés
      let finalRedirect = redirectPath;
      const redirectParams = new URLSearchParams();
      
      if (ticketId) {
        redirectParams.set("ticket", ticketId);
      }
      if (action) {
        redirectParams.set("action", action);
      }
      
      if (redirectParams.toString()) {
        finalRedirect = `${redirectPath}?${redirectParams.toString()}`;
      }
      
      // Petit délai pour laisser le temps au state de se mettre à jour
      setTimeout(() => {
        navigate(finalRedirect);
      }, 100);
    } catch (err: any) {
      const msg = err?.message ?? "Erreur de connexion";
      // Message plus spécifique si le backend n'est pas joignable
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Impossible de contacter le serveur. Vérifiez que le backend est démarré sur http://localhost:8000");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // Couleurs selon spécifications
  const primaryOrange = "#f97316"; // hsl(24 95% 53%)
  const darkBg = "#0f172a"; // hsl(220 50% 10%)
  const darkText = "hsl(220 50% 15%)";
  const borderColor = "#e5e7eb"; // border-border (gris clair)

  return (
    <div style={{ 
      minHeight: "100vh",
      display: "flex",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }}>
      {/* Styles CSS pour l'animation du logo */}
      <style>{`
        @keyframes logoSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes logoSway {
          0%, 100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(-8px);
          }
        }
        
        .logo-animated {
          animation: logoSlideIn 0.6s ease-out forwards,
                     logoSway 3s ease-in-out 0.6s infinite;
        }
      `}</style>
      
      {/* Panneau gauche - 50% largeur, 100vh, p-12 */}
      <div style={{
        width: "50%",
        minHeight: "100vh",
        background: darkBg,
        padding: "48px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between"
      }}>
        {/* Logo et Branding */}
        <div style={{ marginTop: "60px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px"
          }}>
            <img 
              src={logoImage} 
              alt="Logo Caisse de Sécurité Sociale"
              className={logoAnimated ? "logo-animated" : ""}
              style={{
                width: "64px",
                height: "64px",
                objectFit: "contain",
                opacity: logoAnimated ? undefined : 0,
                transform: logoAnimated ? undefined : "translateX(-50px)"
              }}
            />
            <div>
              <h1 style={{
                fontSize: "28px",
                fontWeight: "700",
                color: "#ffffff",
                margin: "0 0 4px 0",
                lineHeight: "1.2"
              }}>
                HelpDesk
              </h1>
              <p style={{
                fontSize: "16px",
                fontWeight: "600",
                color: primaryOrange,
                margin: 0
              }}>
                Caisse de Sécurité Sociale
              </p>
            </div>
          </div>

          {/* Description */}
          <p style={{
            fontSize: "15px",
            lineHeight: "1.6",
            color: "rgba(255, 255, 255, 0.9)",
            marginBottom: "60px",
            maxWidth: "400px"
          }}>
            Système de gestion des incidents informatiques. Connectez-vous pour accéder à votre espace de support technique.
          </p>

          {/* Features avec icônes dans cercles orange translucides */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            {/* Support 24/7 */}
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "rgba(249, 115, 22, 0.2)", // bg-primary/20
                border: "1px solid rgba(249, 115, 22, 0.3)", // border-primary/30
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <Headphones size={24} color={primaryOrange} strokeWidth={2} />
              </div>
              <div>
                <h3 style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#ffffff",
                  margin: "0 0 4px 0"
                }}>
                  Support 24/7
                </h3>
                <p style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.7)",
                  margin: 0,
                  lineHeight: "1.5"
                }}>
                  Assistance disponible à tout moment
                </p>
              </div>
            </div>

            {/* Sécurisé */}
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "rgba(249, 115, 22, 0.2)",
                border: "1px solid rgba(249, 115, 22, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <Shield size={24} color={primaryOrange} strokeWidth={2} />
              </div>
              <div>
                <h3 style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#ffffff",
                  margin: "0 0 4px 0"
                }}>
                  Sécurisé
                </h3>
                <p style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.7)",
                  margin: 0,
                  lineHeight: "1.5"
                }}>
                  Vos données sont protégées
                </p>
              </div>
            </div>

            {/* Rapide */}
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "rgba(249, 115, 22, 0.2)",
                border: "1px solid rgba(249, 115, 22, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>
                <Clock size={24} color={primaryOrange} strokeWidth={2} />
              </div>
              <div>
                <h3 style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#ffffff",
                  margin: "0 0 4px 0"
                }}>
                  Rapide
                </h3>
                <p style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.7)",
                  margin: 0,
                  lineHeight: "1.5"
                }}>
                  Résolution efficace des incidents
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div style={{
          color: "rgba(255, 255, 255, 0.6)",
          fontSize: "14px"
        }}>
          © 2026 Caisse de Sécurité Sociale. Tous droits réservés.
        </div>
      </div>

      {/* Panneau droit - 50% largeur, 100vh, p-8, centré */}
      <div style={{
        width: "50%",
        minHeight: "100vh",
        background: "#ffffff",
        padding: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "480px"
        }}>
          {/* Titre */}
          <div style={{ textAlign: "center", marginBottom: "40px", marginTop: "40px" }}>
            <h2 style={{
              fontSize: "32px",
              fontWeight: "700",
              color: darkText,
              margin: "0 0 8px 0"
            }}>
              Bienvenue
            </h2>
            <p style={{
              fontSize: "16px",
              color: "#6b7280",
              margin: 0
            }}>
              Connectez-vous à votre compte HelpDesk
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} style={{ marginTop: "40px" }}>
            {/* Champ Nom d'utilisateur */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: "500",
                color: darkText
              }}>
                Nom d'utilisateur
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9ca3af",
                  pointerEvents: "none"
                }}>
                  <User size={20} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="votre.email@css.dj"
                  style={{
                    width: "100%",
                    height: "48px",
                    paddingLeft: "48px",
                    paddingRight: "16px",
                    border: `1px solid ${borderColor}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    background: "#ffffff",
                    transition: "all 0.3s ease",
                    boxSizing: "border-box",
                    color: darkText,
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = primaryOrange;
                    e.target.style.boxShadow = `0 0 0 3px rgba(249, 115, 22, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = borderColor;
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Champ Mot de passe */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: "500",
                color: darkText
              }}>
                Mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9ca3af",
                  pointerEvents: "none"
                }}>
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Entrez votre mot de passe"
                  style={{
                    width: "100%",
                    height: "48px",
                    paddingLeft: "48px",
                    paddingRight: "48px",
                    border: `1px solid ${borderColor}`,
                    borderRadius: "8px",
                    fontSize: "15px",
                    background: "#ffffff",
                    transition: "all 0.3s ease",
                    boxSizing: "border-box",
                    color: darkText,
                    fontFamily: "inherit"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = primaryOrange;
                    e.target.style.boxShadow = `0 0 0 3px rgba(249, 115, 22, 0.1)`;
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = borderColor;
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#9ca3af",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.2s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = primaryOrange}
                  onMouseLeave={(e) => e.currentTarget.style.color = "#9ca3af"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Options : Se souvenir + Mot de passe oublié */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px"
            }}>
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                fontSize: "14px",
                color: "#6b7280"
              }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                    accentColor: primaryOrange
                  }}
                />
                Se souvenir de moi
              </label>
              <a href="#" style={{
                fontSize: "13px",
                color: primaryOrange,
                textDecoration: "none",
                fontWeight: "500",
                transition: "color 0.2s ease"
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "#ea580c"}
              onMouseLeave={(e) => e.currentTarget.style.color = primaryOrange}
              >
                Mot de passe oublié ?
              </a>
            </div>

            {/* Message d'erreur */}
            {error && (
              <div style={{
                padding: "12px",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                marginBottom: "24px",
                color: "#991b1b",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}

            {/* Bouton de connexion - Pill (rounded-full) */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                height: "48px",
                background: `linear-gradient(135deg, ${primaryOrange} 0%, #ea580c 100%)`,
                color: "white",
                border: "none",
                borderRadius: "9999px", // rounded-full
                fontSize: "15px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.3s ease",
                boxShadow: `0 4px 12px rgba(249, 115, 22, 0.4)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: loading ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = `linear-gradient(135deg, #fb923c 0%, ${primaryOrange} 100%)`;
                  e.currentTarget.style.boxShadow = `0 6px 20px rgba(249, 115, 22, 0.6)`;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(135deg, ${primaryOrange} 0%, #ea580c 100%)`;
                e.currentTarget.style.boxShadow = `0 4px 12px rgba(249, 115, 22, 0.4)`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {loading ? "Connexion..." : (
                <>
                  Se connecter
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Séparateur avec "ou" */}
          <div style={{
            display: "flex",
            alignItems: "center",
            margin: "32px 0",
            gap: "16px"
          }}>
            <div style={{
              flex: 1,
              height: "1px",
              background: borderColor
            }}></div>
            <span style={{
              fontSize: "14px",
              color: "#9ca3af"
            }}>
              ou
            </span>
            <div style={{
              flex: 1,
              height: "1px",
              background: borderColor
            }}></div>
          </div>

          {/* CTA Aide */}
          <div style={{
            textAlign: "center"
          }}>
            <p style={{
              fontSize: "14px",
              color: "#6b7280",
              margin: "0 0 12px 0"
            }}>
              Besoin d'aide pour vous connecter ?
            </p>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                background: "white",
                border: `1px solid ${borderColor}`,
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                color: darkText,
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = primaryOrange;
                e.currentTarget.style.color = primaryOrange;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = borderColor;
                e.currentTarget.style.color = darkText;
              }}
            >
              <Headphones size={18} />
              Contacter le support IT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
