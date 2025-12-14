import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

interface LoginPageProps {
  onLogin: (token: string) => void;
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = new URLSearchParams();
      body.append("username", username);
      body.append("password", password);

      const res = await fetch("http://localhost:8000/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!res.ok) {
        throw new Error("Identifiants invalides");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      
      // Récupérer les infos de l'utilisateur pour connaître son rôle
      try {
        const userRes = await fetch("http://localhost:8000/auth/me", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
          },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.role && userData.role.name) {
            localStorage.setItem("userRole", userData.role.name);
            console.log("Rôle utilisateur:", userData.role.name); // Debug
          }
        }
      } catch (err) {
        console.error("Erreur récupération infos utilisateur:", err);
      }
      
      onLogin(data.access_token);
      
      // Petit délai pour laisser le temps au state de se mettre à jour
      setTimeout(() => {
        navigate("/dashboard");
      }, 100);
    } catch (err: any) {
      setError(err.message ?? "Erreur de connexion");
    }
  }

  return (
    <div style={{ 
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#f5f5f5",
      padding: "20px"
    }}>
      {/* Logo/Titre Systèmes d'Incidents */}
      <div style={{
        marginBottom: "40px",
        textAlign: "center"
      }}>
        <div style={{
          fontSize: "48px",
          fontWeight: "700",
          color: "#1e293b",
          letterSpacing: "-1px",
          marginBottom: "8px",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
        }}>
          SI
        </div>
        <div style={{
          fontSize: "14px",
          color: "#64748b",
          fontWeight: "500",
          letterSpacing: "2px",
          textTransform: "uppercase"
        }}>
          Systèmes d'Incidents
        </div>
        {/* Ligne décorative sous le logo */}
        <div style={{
          width: "60px",
          height: "3px",
          background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
          margin: "12px auto 0",
          borderRadius: "2px"
        }}></div>
      </div>

      <div style={{ 
        maxWidth: 500, 
        width: "100%"
    }}>
      <div style={{
        background: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          padding: "40px",
        marginBottom: "24px"
      }}>
          <h1 style={{ 
            marginBottom: "32px", 
            fontSize: "28px", 
            fontWeight: "600",
            color: "#1e293b",
            textAlign: "center"
          }}>
            Connexion à votre compte
          </h1>
        <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "8px", 
                fontSize: "14px", 
                fontWeight: "500",
                color: "#374151"
              }}>
                Nom d'utilisateur
              </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
                placeholder="Entrez votre nom d'utilisateur"
                style={{ 
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: "#f9fafb",
                  transition: "all 0.2s ease",
                  boxSizing: "border-box"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#3b82f6";
                  e.target.style.background = "white";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                  e.target.style.background = "#f9fafb";
                }}
            />
          </div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ 
                  fontSize: "14px", 
                  fontWeight: "500",
                  color: "#374151"
                }}>
                  Mot de passe
                </label>
                <a href="#" style={{ 
                  fontSize: "12px", 
                  color: "#3b82f6",
                  textDecoration: "none"
                }}>
                  Mot de passe oublié ?
                </a>
              </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
                placeholder="Entrez votre mot de passe"
                style={{ 
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: "#f9fafb",
                  transition: "all 0.2s ease",
                  boxSizing: "border-box"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#3b82f6";
                  e.target.style.background = "white";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                  e.target.style.background = "#f9fafb";
                }}
            />
          </div>
            {error && (
      <div style={{
                padding: "12px",
                background: "#fee2e2",
                border: "1px solid #fecaca",
        borderRadius: "8px",
                marginBottom: "20px",
                color: "#991b1b",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}
            <button 
              type="submit" 
              style={{ 
                width: "100%",
                padding: "14px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "background 0.2s ease",
                boxShadow: "0 2px 4px rgba(59, 130, 246, 0.3)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#2563eb";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#3b82f6";
              }}
            >
              Se connecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

