import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  ticket_id?: string | null;
}

interface UserRead {
  full_name: string;
  email: string;
  agency?: string | null;
  availability_status?: string | null;
}

interface TechnicianDashboardProps {
  token: string;
}

interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_at: string | null;
  type: string;
  creator?: {
    full_name: string;
    agency: string | null;
  };
  attachments?: any;
}

interface TicketHistory {
  id: string;
  ticket_id: string;
  old_status?: string | null;
  new_status: string;
  user_id: string;
  reason?: string | null;
  changed_at: string;
}

function TechnicianDashboard({ token }: TechnicianDashboardProps) {
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [requestInfoText, setRequestInfoText] = useState("");
  const [requestInfoTicket, setRequestInfoTicket] = useState<string | null>(null);
  const [resolveTicket, setResolveTicket] = useState<string | null>(null);
  const [resolutionSummary, setResolutionSummary] = useState<string>("");
  const [viewTicketDetails, setViewTicketDetails] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<UserRead | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const [availabilityStatus, setAvailabilityStatus] = useState<string>("disponible");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [resumedFlags, setResumedFlags] = useState<Record<string, boolean>>({});

  async function loadNotifications() {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/notifications/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error("Erreur lors du chargement des notifications:", err);
    }
  }

  async function loadUnreadCount() {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/notifications/unread/count", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error("Erreur lors du chargement du nombre de notifications non lues:", err);
    }
  }

  async function markNotificationAsRead(notificationId: string) {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/notifications/${notificationId}/read`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        await loadNotifications();
        await loadUnreadCount();
      }
    } catch (err) {
      console.error("Erreur lors du marquage de la notification comme lue:", err);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    window.location.href = "/";
  }

  async function updateAvailabilityStatus(newStatus: string) {
    if (!token || updatingStatus) return;
    
    setUpdatingStatus(true);
    try {
      const res = await fetch("http://localhost:8000/users/me/availability-status", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          availability_status: newStatus
        }),
      });

      if (res.ok) {
        setAvailabilityStatus(newStatus);
        setUserInfo(prev => prev ? { ...prev, availability_status: newStatus } : null);
        alert("Statut de disponibilité mis à jour avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de mettre à jour le statut"}`);
      }
    } catch (err) {
      console.error("Erreur mise à jour statut:", err);
      alert("Erreur lors de la mise à jour du statut");
    } finally {
      setUpdatingStatus(false);
    }
  }

  useEffect(() => {
    async function loadTickets() {
      try {
        const res = await fetch("http://localhost:8000/tickets/assigned", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setAllTickets(data);
        }
      } catch (err) {
        console.error("Erreur chargement tickets:", err);
      }
    }

    async function loadUserInfo() {
      try {
        const meRes = await fetch("http://localhost:8000/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          setUserInfo({
            full_name: meData.full_name,
            email: meData.email,
            agency: meData.agency,
            availability_status: meData.availability_status
          });
          if (meData.availability_status) {
            setAvailabilityStatus(meData.availability_status);
          }
        }
      } catch (err) {
        console.error("Erreur chargement infos utilisateur:", err);
      }
    }

    void loadTickets();
    void loadUserInfo();
    void loadNotifications();
    void loadUnreadCount();

    // Recharger les notifications toutes les 30 secondes
    const interval = setInterval(() => {
      void loadNotifications();
      void loadUnreadCount();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [token]);

  async function loadTicketDetails(ticketId: string) {
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTicketDetails(data);
        await loadTicketHistory(ticketId);
        setViewTicketDetails(ticketId);
      } else {
        alert("Erreur lors du chargement des détails du ticket");
      }
    } catch (err) {
      console.error("Erreur chargement détails:", err);
      alert("Erreur lors du chargement des détails");
    }
  }

  async function loadTicketHistory(ticketId: string) {
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTicketHistory(Array.isArray(data) ? data : []);
      } else {
        setTicketHistory([]);
      }
    } catch {
      setTicketHistory([]);
    }
  }


  async function handleTakeCharge(ticketId: string) {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "en_cours",
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/assigned", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        alert("Ticket pris en charge");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de prendre en charge"}`);
      }
    } catch (err) {
      console.error("Erreur prise en charge:", err);
      alert("Erreur lors de la prise en charge");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddComment(ticketId: string) {
    if (!commentText.trim()) {
      alert("Veuillez entrer un commentaire");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          content: commentText,
          type: "technique",
        }),
      });

      if (res.ok) {
        setCommentText("");
        setSelectedTicket(null);
        alert("Commentaire ajouté avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible d'ajouter le commentaire"}`);
      }
    } catch (err) {
      console.error("Erreur ajout commentaire:", err);
      alert("Erreur lors de l'ajout du commentaire");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestInfo(ticketId: string) {
    if (!requestInfoText.trim()) {
      alert("Veuillez entrer votre demande d'information");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          content: `[DEMANDE D'INFORMATION] ${requestInfoText}`,
          type: "utilisateur",  // Type utilisateur pour indiquer que c'est une demande pour l'utilisateur
        }),
      });

      if (res.ok) {
        setRequestInfoText("");
        setRequestInfoTicket(null);
        alert("Demande d'information envoyée à l'utilisateur");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible d'envoyer la demande"}`);
      }
    } catch (err) {
      console.error("Erreur demande info:", err);
      alert("Erreur lors de l'envoi de la demande");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkResolved(ticketId: string) {
    // Ouvrir le modal pour demander le résumé
    setResolveTicket(ticketId);
  }

  async function confirmMarkResolved(ticketId: string) {
    if (!resolutionSummary.trim()) {
      alert("Veuillez entrer un résumé de la résolution");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "resolu",
          resolution_summary: resolutionSummary.trim(),
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/assigned", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        setResolveTicket(null);
        setResolutionSummary("");
        alert("Ticket marqué comme résolu. L'utilisateur a été notifié.");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de marquer comme résolu"}`);
      }
    } catch (err) {
      console.error("Erreur résolution:", err);
      alert("Erreur lors de la résolution");
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les tickets selon leur statut
  const assignedTickets = allTickets.filter((t) => t.status === "assigne_technicien");
  const inProgressTickets = allTickets.filter((t) => t.status === "en_cours");
  // Tickets résolus : inclure les tickets avec statut "resolu" ou "cloture" qui ont été assignés au technicien
  const resolvedTickets = allTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
  const rejectedTickets = allTickets.filter((t) => t.status === "rejete");

  useEffect(() => {
    if (activeSection !== "tickets-rejetes") return;
    const toFetch = rejectedTickets.filter((t) => !(t.id in rejectionReasons));
    toFetch.forEach(async (t) => {
      try {
        const res = await fetch(`http://localhost:8000/tickets/${t.id}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const entry = Array.isArray(data) ? data.find((h: any) => h.new_status === "rejete" && h.reason) : null;
          const reason = entry?.reason || "";
          setRejectionReasons((prev) => ({ ...prev, [t.id]: reason }));
        } else {
          setRejectionReasons((prev) => ({ ...prev, [t.id]: "" }));
        }
      } catch {
        setRejectionReasons((prev) => ({ ...prev, [t.id]: "" }));
      }
    });
  }, [activeSection, rejectedTickets, token]);

  // Détecter les tickets en cours qui ont été repris après un rejet
  useEffect(() => {
    const toCheck = inProgressTickets.filter((t) => !(String(t.id) in resumedFlags));
    if (toCheck.length === 0 || !token || token.trim() === "") return;

    toCheck.forEach(async (t) => {
      try {
        const res = await fetch(`http://localhost:8000/tickets/${t.id}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setResumedFlags((prev) => ({ ...prev, [String(t.id)]: false }));
          return;
        }
        const data = await res.json();
        const isResumed = Array.isArray(data)
          ? data.some((h: any) => (h.old_status === "rejete") && h.new_status === "en_cours")
          : false;
        setResumedFlags((prev) => ({ ...prev, [String(t.id)]: !!isResumed }));
      } catch {
        setResumedFlags((prev) => ({ ...prev, [String(t.id)]: false }));
      }
    });
  }, [inProgressTickets, token, resumedFlags]);

  const assignedCount = assignedTickets.length;
  const inProgressCount = inProgressTickets.length;
  const resolvedCount = resolvedTickets.length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif", background: "#f5f5f5" }}>
      {/* Sidebar */}
      <div style={{ 
        width: "250px", 
        background: "#1e293b", 
        color: "white", 
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 7L12 3L20 7V17L12 21L4 17V7Z" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
                <path d="M4 7L12 11L20 7" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 11V21" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontSize: "18px", fontWeight: "600" }}>Gestion d'Incidents</div>
          </div>
        </div>
        <div 
          onClick={() => setActiveSection("dashboard")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            background: activeSection === "dashboard" ? "rgba(255,255,255,0.1)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="11" width="3" height="7" rx="1" fill="white" />
              <rect x="10.5" y="8" width="3" height="10" rx="1" fill="white" />
              <rect x="17" y="5" width="3" height="13" rx="1" fill="white" />
            </svg>
          </div>
          <div>Tableau de Bord</div>
        </div>
        <div 
          onClick={() => setActiveSection("tickets-resolus")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            background: activeSection === "tickets-resolus" ? "rgba(255,255,255,0.1)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>Tickets Résolus</div>
        </div>
        <div 
          onClick={() => setActiveSection("tickets-rejetes")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            background: activeSection === "tickets-rejetes" ? "rgba(255,255,255,0.1)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
            </svg>
          </div>
          <div>Tickets Rejetés</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre de navigation en haut */}
        <div style={{
          background: "#1e293b",
          padding: "16px 30px",
          borderBottom: "1px solid #0f172a"
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Partie gauche - Titre */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "18px", fontWeight: "600", color: "white" }}> </div>
            </div>
            
            {/* Partie droite - Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              {/* Bouton + (création rapide) */}
              <button
                type="button"
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.1)",
                  color: "white",
                  cursor: "pointer"
                }}
              >
                +
              </button>
            
              <div 
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ 
                  cursor: "pointer", 
                  width: "24px", 
                  height: "24px", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "white",
                  position: "relative"
                }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="currentColor"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="currentColor"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: "-5px",
                    right: "-5px",
                    minWidth: "18px",
                    height: "18px",
                    background: "#ef4444",
                    borderRadius: "50%",
                    border: "2px solid #1e293b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: "white",
                    padding: "0 4px"
                  }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <div style={{ 
                width: "1px", 
                height: "24px", 
                background: "#4b5563" 
              }}></div>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px",
                color: "white",
                position: "relative"
              }}>
                <span style={{ fontSize: "14px", fontWeight: "500" }}>
                  {userInfo?.full_name || "Utilisateur"}
                </span>
                <div 
                  style={{ position: "relative", cursor: "pointer" }}
                  onClick={() => {
                    const menu = document.getElementById("profile-menu");
                    if (menu) {
                      menu.style.display = menu.style.display === "none" ? "block" : "none";
                    }
                  }}
                >
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#3b82f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "600"
                  }}>
                    {userInfo?.full_name ? userInfo.full_name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div style={{
                    position: "absolute",
                    bottom: "0",
                    right: "0",
                    width: "12px",
                    height: "12px",
                    background: "#10b981",
                    borderRadius: "50%",
                    border: "2px solid #1e293b"
                  }}></div>
                </div>
                <div
                  id="profile-menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "48px",
                    background: "white",
                    borderRadius: "8px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                    padding: "8px 0",
                    minWidth: "160px",
                    zIndex: 50,
                    color: "#111827",
                    display: "none"
                  }}
                >
                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      padding: "8px 16px",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#111827"
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>⎋</span>
                    <span>Se déconnecter</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", margin: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", color: "#333" }}>Statut :</span>
                <select
                  value={availabilityStatus}
                  onChange={(e) => updateAvailabilityStatus(e.target.value)}
                  disabled={updatingStatus}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #ddd",
                    background: "white",
                    color: "#333",
                    fontSize: "14px",
                    outline: "none"
                  }}
                >
                  <option value="disponible">Disponible</option>
                  <option value="occupé">Occupé</option>
                  <option value="en pause">En pause</option>
                </select>
              </div>
            </div>
            {activeSection === "dashboard" && (
              <>
                <h2>Tableau de bord - Technicien</h2>


                <div style={{ display: "flex", gap: "16px", margin: "24px 0" }}>
                  <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
                    <div style={{ fontSize: "32px", fontWeight: "bold", color: "#2196f3" }}>{assignedCount}</div>
                    <div style={{ color: "#666", marginTop: "4px" }}>Tickets assignés</div>
                  </div>
                  <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
                    <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ff9800" }}>{inProgressCount}</div>
                    <div style={{ color: "#666", marginTop: "4px" }}>Tickets en cours</div>
                  </div>
                  <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
                    <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4caf50" }}>{resolvedCount}</div>
                    <div style={{ color: "#666", marginTop: "4px" }}>Tickets résolus</div>
                  </div>
                </div>

                <h3 style={{ marginTop: "32px" }}>Mes tickets assignés</h3>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Titre</th>
                      <th>Priorité</th>
                      <th>Statut</th>
                      <th>Assigné le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedTickets.length === 0 && inProgressTickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "20px", color: "#999" }}>
                          Aucun ticket assigné
                        </td>
                      </tr>
                    ) : (
                      <>
                        {assignedTickets.map((t) => (
                          <tr key={t.id}>
                            <td>#{t.number}</td>
                            <td>{t.title}</td>
                            <td>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                                color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                background: "#e3f2fd",
                                color: "#1976d2",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                Assigné
                              </span>
                            </td>
                            <td>{t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}</td>
                            <td>
                              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => loadTicketDetails(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleTakeCharge(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Prendre en charge
                                </button>
                                <button
                                  onClick={() => setSelectedTicket(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Ajouter commentaire
                                </button>
                                <button
                                  onClick={() => setRequestInfoTicket(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Demander info
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {inProgressTickets.map((t) => (
                          <tr key={t.id}>
                            <td>#{t.number}</td>
                            <td>{t.title}</td>
                            <td>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                                color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                background: "#fff3e0",
                                color: "#f57c00",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                En cours
                              </span>
                            </td>
                            <td>{t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}</td>
                            <td>
                              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => loadTicketDetails(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setSelectedTicket(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Ajouter commentaire
                                </button>
                                <button
                                  onClick={() => setRequestInfoTicket(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Demander info
                                </button>
                                <button
                                  onClick={() => handleMarkResolved(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Marquer résolu
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </>
            )}

            {activeSection === "tickets-resolus" && (
              <div>
                <h2 style={{ marginBottom: "24px" }}>Tickets Résolus</h2>
                <div style={{ 
                  background: "white", 
                  borderRadius: "8px", 
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  overflow: "hidden"
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>ID</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Titre</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Statut</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Priorité</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Type</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Assigné le</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                            Aucun ticket résolu
                          </td>
                        </tr>
                      ) : (
                        resolvedTickets.map((t) => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                            <td style={{ padding: "12px 16px" }}>#{t.number}</td>
                            <td style={{ padding: "12px 16px" }}>{t.title}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.status === "resolu" ? "#d4edda" : "#6c757d",
                                color: t.status === "resolu" ? "#155724" : "white",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                {t.status === "resolu" ? "Résolu" : t.status === "cloture" ? "Clôturé" : t.status}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                                color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                background: "#e3f2fd",
                                color: "#1976d2"
                              }}>
                                {t.type === "materiel" ? "Matériel" : "Applicatif"}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", color: "#666" }}>
                              {t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <button
                                onClick={() => loadTicketDetails(t.id)}
                                disabled={loading}
                                style={{ 
                                  fontSize: "12px", 
                                  padding: "6px 12px", 
                                  backgroundColor: "#6c757d", 
                                  color: "white", 
                                  border: "none", 
                                  borderRadius: "4px", 
                                  cursor: "pointer" 
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeSection === "tickets-rejetes" && (
              <div>
                <h2 style={{ marginBottom: "24px" }}>Tickets Rejetés</h2>
                <div style={{ 
                  background: "white", 
                  borderRadius: "8px", 
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  overflow: "hidden"
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>ID</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Titre</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Statut</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Priorité</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Type</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Assigné le</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                            Aucun ticket rejeté
                          </td>
                        </tr>
                      ) : (
                        rejectedTickets.map((t) => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                            <td style={{ padding: "12px 16px" }}>#{t.number}</td>
                            <td style={{ padding: "12px 16px" }}>{t.title}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: "#fee2e2",
                                color: "#991b1b",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                Rejeté
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                                color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                background: "#e3f2fd",
                                color: "#1976d2"
                              }}>
                                {t.type === "materiel" ? "Matériel" : "Applicatif"}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", color: "#666" }}>
                              {t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => loadTicketDetails(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleTakeCharge(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Reprendre
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTicket && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "8px",
            maxWidth: "500px",
            width: "90%"
          }}>
            <h3>Ajouter un commentaire technique</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Entrez votre commentaire technique..."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "8px",
                marginTop: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => handleAddComment(selectedTicket)}
                disabled={loading || !commentText.trim()}
                style={{ flex: 1, padding: "10px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Ajouter
              </button>
              <button
                onClick={() => {
                  setSelectedTicket(null);
                  setCommentText("");
                }}
                style={{ flex: 1, padding: "10px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {requestInfoTicket && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "8px",
            maxWidth: "500px",
            width: "90%"
          }}>
            <h3>Demander des informations à l'utilisateur</h3>
            <p style={{ fontSize: "14px", color: "#666", marginTop: "8px", marginBottom: "12px" }}>
              Cette demande sera envoyée à l'utilisateur créateur du ticket.
            </p>
            <textarea
              value={requestInfoText}
              onChange={(e) => setRequestInfoText(e.target.value)}
              placeholder="Quelles informations avez-vous besoin de l'utilisateur ?"
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "8px",
                marginTop: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px"
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => handleRequestInfo(requestInfoTicket)}
                disabled={loading || !requestInfoText.trim()}
                style={{ flex: 1, padding: "10px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Envoyer
              </button>
              <button
                onClick={() => {
                  setRequestInfoTicket(null);
                  setRequestInfoText("");
                }}
                style={{ flex: 1, padding: "10px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pour résumé de résolution */}
      {resolveTicket && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "8px",
            maxWidth: "500px",
            width: "90%"
          }}>
            <h3 style={{ marginBottom: "16px" }}>Marquer le ticket comme résolu</h3>
            <p style={{ marginBottom: "16px", color: "#666", fontSize: "14px" }}>
              Veuillez fournir un résumé de la résolution. Ce résumé sera visible par l'utilisateur et enregistré dans l'historique.
            </p>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              placeholder="Résumé de la résolution (actions effectuées, solution appliquée, tests effectués, etc.)"
              rows={6}
              style={{
                width: "100%",
                padding: "8px",
                marginTop: "12px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                resize: "vertical"
              }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => confirmMarkResolved(resolveTicket)}
                disabled={loading || !resolutionSummary.trim()}
                style={{ flex: 1, padding: "10px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Marquer comme résolu
              </button>
              <button
                onClick={() => {
                  setResolveTicket(null);
                  setResolutionSummary("");
                }}
                style={{ flex: 1, padding: "10px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pour voir les détails du ticket */}
      {viewTicketDetails && ticketDetails && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "white",
            padding: "24px",
            borderRadius: "8px",
            maxWidth: "700px",
            width: "90%",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Détails du ticket #{ticketDetails.number}</h3>
              {ticketDetails.status === "rejete" && (
                <span style={{
                  padding: "6px 10px",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fecaca"
                }}>
                  Rejeté
                </span>
              )}
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <strong>Titre :</strong>
              <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px" }}>
                {ticketDetails.title}
              </p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <strong>Description :</strong>
              <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px", whiteSpace: "pre-wrap" }}>
                {ticketDetails.description}
              </p>
            </div>

            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              <div>
                <strong>Type :</strong>
                <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#e3f2fd", borderRadius: "4px" }}>
                  {ticketDetails.type === "materiel" ? "Matériel" : "Applicatif"}
                </span>
              </div>
              <div>
                <strong>Priorité :</strong>
                <span style={{
                  marginLeft: "8px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "500",
                  background: ticketDetails.priority === "critique" ? "#f44336" : ticketDetails.priority === "haute" ? "#ff9800" : ticketDetails.priority === "moyenne" ? "#ffc107" : "#9e9e9e",
                  color: "white"
                }}>
                  {ticketDetails.priority}
                </span>
              </div>
            </div>

            {ticketDetails.status === "rejete" && (
              <div style={{ marginBottom: "16px" }}>
                <strong>Motif du rejet :</strong>
                <p style={{ marginTop: "4px", padding: "8px", background: "#fff5f5", borderRadius: "4px", color: "#991b1b" }}>
                  {(() => {
                    const entry = ticketHistory.find((h) => h.new_status === "rejete" && h.reason);
                    if (!entry || !entry.reason) return "Motif non fourni";
                    return entry.reason.includes("Motif:") ? (entry.reason.split("Motif:").pop() || "").trim() : entry.reason;
                  })()}
                </p>
                {(() => {
                  const entry = ticketHistory.find((h) => h.new_status === "rejete");
                  if (!entry) return null;
                  const when = new Date(entry.changed_at).toLocaleString("fr-FR");
                  const who = ticketDetails.creator?.full_name || "Utilisateur";
                  return (
                    <div style={{ fontSize: "12px", color: "#555" }}>
                      {`Par: ${who} • Le: ${when}`}
                    </div>
                  );
                })()}
              </div>
            )}

            {ticketDetails.creator && (
              <div style={{ marginBottom: "16px" }}>
                <strong>Créateur :</strong>
                <p style={{ marginTop: "4px" }}>
                  {ticketDetails.creator.full_name}
                  {ticketDetails.creator.agency && ` - ${ticketDetails.creator.agency}`}
                </p>
              </div>
            )}

            {ticketDetails.attachments && (
              <div style={{ marginBottom: "16px" }}>
                <strong>Pièces jointes :</strong>
                <div style={{ marginTop: "8px" }}>
                  {Array.isArray(ticketDetails.attachments) && ticketDetails.attachments.length > 0 ? (
                    ticketDetails.attachments.map((att: any, idx: number) => (
                      <div key={idx} style={{ padding: "8px", marginTop: "4px", background: "#f8f9fa", borderRadius: "4px" }}>
                        {att.name || att.filename || `Fichier ${idx + 1}`}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "#999", fontStyle: "italic" }}>Aucune pièce jointe</p>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: "16px" }}>
              <strong>Historique :</strong>
              <div style={{ marginTop: "8px" }}>
                {ticketHistory.length === 0 ? (
                  <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>
                ) : (
                  ticketHistory.map((h) => (
                    <div key={h.id} style={{ padding: "8px", marginTop: "4px", background: "#f8f9fa", borderRadius: "4px" }}>
                      <div style={{ fontSize: "12px", color: "#555" }}>
                        {new Date(h.changed_at).toLocaleString("fr-FR")}
                      </div>
                      <div style={{ marginTop: "4px", fontWeight: 500 }}>
                        {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                      </div>
                      {h.reason && (
                        <div style={{ marginTop: "4px", color: "#666" }}>{h.reason}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => {
                  setViewTicketDetails(null);
                  setTicketDetails(null);
                  setTicketHistory([]);
                }}
                style={{ flex: 1, padding: "10px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <div 
          onClick={() => setShowNotifications(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-end",
            padding: "60px 20px 20px 20px",
            zIndex: 1000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "12px",
              width: "400px",
              maxHeight: "600px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            <div style={{
              padding: "20px",
              borderBottom: "1px solid #eee",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>
                Notifications
              </h3>
              <button
                onClick={() => setShowNotifications(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#999",
                  padding: "0",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px"
            }}>
              {notifications.length === 0 ? (
                <div style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "#999"
                }}>
                  Aucune notification
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.read) {
                        void markNotificationAsRead(notif.id);
                      }
                    }}
                    style={{
                      padding: "12px",
                      marginBottom: "8px",
                      borderRadius: "8px",
                      background: notif.read ? "#f9f9f9" : "#e3f2fd",
                      border: notif.read ? "1px solid #eee" : "1px solid #90caf9",
                      cursor: "pointer",
                      transition: "background 0.2s"
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "10px"
                    }}>
                      <div style={{ flex: 1 }}>
                        <p style={{
                          margin: 0,
                          fontSize: "14px",
                          color: "#333",
                          lineHeight: "1.5"
                        }}>
                          {notif.message}
                        </p>
                        <p style={{
                          margin: "4px 0 0 0",
                          fontSize: "11px",
                          color: "#999"
                        }}>
                          {new Date(notif.created_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </p>
                      </div>
                      {!notif.read && (
                        <div style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#007bff",
                          flexShrink: 0,
                          marginTop: "4px"
                        }}></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TechnicianDashboard;
