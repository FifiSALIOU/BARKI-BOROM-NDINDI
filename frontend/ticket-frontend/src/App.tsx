import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import UserDashboard from "./pages/UserDashboard";
import SecretaryDashboard from "./pages/SecretaryDashboard";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import DSIDashboard from "./pages/DSIDashboard";

function App() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  });
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (token) {
        localStorage.setItem("token", token);
        // Récupérer le rôle depuis localStorage
        const role = localStorage.getItem("userRole");
        setUserRole(role);
        
        // Si pas de rôle en localStorage, le récupérer depuis l'API
        if (!role) {
          fetch("http://localhost:8000/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
            .then((res) => res.json())
            .then((userData) => {
              if (userData.role && userData.role.name) {
                localStorage.setItem("userRole", userData.role.name);
                setUserRole(userData.role.name);
              }
            })
            .catch((err) => console.error("Erreur récupération rôle:", err));
        }
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("userRole");
        setUserRole(null);
      }
    } catch (err) {
      console.error("Erreur localStorage:", err);
    }
  }, [token]);

  // Fonction pour déterminer le dashboard selon le rôle
  function getDashboard() {
    if (!token) return <Navigate to="/" replace />;
    
    switch (userRole) {
      case "Secrétaire DSI":
      case "Adjoint DSI":
        return <SecretaryDashboard token={token} />;
      case "Technicien":
        return <TechnicianDashboard token={token} />;
      case "DSI":
      case "Admin":  // Admin a les mêmes droits que DSI
        return <DSIDashboard token={token} />;
      case "Utilisateur":
      default:
        return <UserDashboard token={token} />;
    }
  }

  return (
    <div>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={setToken} />} />
        <Route path="/dashboard" element={getDashboard()} />
        <Route path="/dashboard/user" element={<UserDashboard token={token || ""} />} />
        <Route path="/dashboard/secretary" element={<SecretaryDashboard token={token || ""} />} />
        <Route path="/dashboard/technician" element={<TechnicianDashboard token={token || ""} />} />
        <Route path="/dashboard/dsi" element={<DSIDashboard token={token || ""} />} />
      </Routes>
    </div>
  );
}

export default App;

