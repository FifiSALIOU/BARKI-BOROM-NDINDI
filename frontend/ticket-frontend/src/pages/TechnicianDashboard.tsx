import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelLeft, ClipboardList, Clock3, CheckCircle2 } from "lucide-react";

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
  status?: string | null;
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
  category?: string | null;
  creator?: {
    full_name: string;
    agency: string | null;
  };
  technician?: {
    full_name: string;
  } | null;
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
  user?: {
    full_name: string;
  } | null;
}

function TechnicianDashboard({ token }: TechnicianDashboardProps) {
  const [searchParams] = useSearchParams();
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
  const [showNotificationsTicketsView, setShowNotificationsTicketsView] = useState<boolean>(false);
  const [notificationsTickets, setNotificationsTickets] = useState<Ticket[]>([]);
  const [selectedNotificationTicket, setSelectedNotificationTicket] = useState<string | null>(null);
  const [selectedNotificationTicketDetails, setSelectedNotificationTicketDetails] = useState<Ticket | null>(null);
  const [userInfo, setUserInfo] = useState<UserRead | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const notificationsSectionRef = useRef<HTMLDivElement>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [resumedFlags, setResumedFlags] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [openActionsMenuFor, setOpenActionsMenuFor] = useState<string | null>(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{ top: number; left: number } | null>(null);

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
  
  async function clearAllNotifications() {
    const confirmed = window.confirm("Confirmer l'effacement de toutes les notifications ?");
    if (!confirmed) return;
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (token && token.trim() !== "" && unreadIds.length > 0) {
        await Promise.all(
          unreadIds.map((id) =>
            fetch(`http://localhost:8000/notifications/${id}/read`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}` },
            })
          )
        );
      }
    } catch {}
    setNotifications([]);
    setUnreadCount(0);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    window.location.href = "/";
  }

  // La disponibilité du technicien est désormais déterminée côté DSI via le statut global de l'utilisateur.

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
          });
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

  // Gérer les paramètres URL pour ouvrir automatiquement le ticket
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    
    if (ticketId && allTickets.length > 0) {
      // Vérifier que le ticket existe et est assigné au technicien
      const ticket = allTickets.find(t => t.id === ticketId);
      if (ticket) {
        // Charger et ouvrir automatiquement les détails du ticket
        async function openTicket() {
          try {
            const res = await fetch(`http://localhost:8000/tickets/${ticketId}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              setTicketDetails(data);
              // Charger l'historique
              try {
                const historyRes = await fetch(`http://localhost:8000/tickets/${ticketId}/history`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                if (historyRes.ok) {
                  const historyData = await historyRes.json();
                  setTicketHistory(Array.isArray(historyData) ? historyData : []);
                }
              } catch {}
              setViewTicketDetails(ticketId);
              // Nettoyer l'URL après avoir ouvert le ticket
              window.history.replaceState({}, "", window.location.pathname);
            }
          } catch (err) {
            console.error("Erreur chargement détails:", err);
          }
        }
        void openTicket();
      }
    }
  }, [searchParams, allTickets, token]);

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

  async function loadNotificationsTickets() {
    if (!token || notifications.length === 0) {
      setNotificationsTickets([]);
      return;
    }
    
    try {
      // Récupérer tous les ticket_id uniques des notifications
      const ticketIds = notifications
        .filter(n => n.ticket_id)
        .map(n => n.ticket_id)
        .filter((id, index, self) => self.indexOf(id) === index) as string[];
      
      if (ticketIds.length === 0) {
        setNotificationsTickets([]);
        return;
      }

      // Charger les détails de chaque ticket
      const ticketsPromises = ticketIds.map(async (ticketId) => {
        try {
          const res = await fetch(`http://localhost:8000/tickets/${ticketId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (res.ok) {
            return await res.json();
          }
          return null;
        } catch (err) {
          console.error(`Erreur chargement ticket ${ticketId}:`, err);
          return null;
        }
      });

      const tickets = (await Promise.all(ticketsPromises)).filter(t => t !== null) as Ticket[];
      setNotificationsTickets(tickets);
      
      // Si un ticket est déjà sélectionné, charger ses détails
      if (selectedNotificationTicket) {
        const ticket = tickets.find(t => t.id === selectedNotificationTicket);
        if (ticket) {
          setSelectedNotificationTicketDetails(ticket);
          await loadTicketHistory(selectedNotificationTicket);
        } else {
          // Si le ticket sélectionné n'est pas dans la liste, le charger séparément
          try {
            const res = await fetch(`http://localhost:8000/tickets/${selectedNotificationTicket}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              setSelectedNotificationTicketDetails(data);
              await loadTicketHistory(selectedNotificationTicket);
            }
          } catch (err) {
            console.error("Erreur chargement détails ticket sélectionné:", err);
          }
        }
      }
    } catch (err) {
      console.error("Erreur chargement tickets notifications:", err);
    }
  }

  async function handleNotificationClick(notification: Notification) {
    if (!notification.ticket_id) return;
    
    // Marquer comme lu
    if (!notification.read) {
      await markNotificationAsRead(notification.id);
    }
    
    // Ouvrir la vue des tickets avec notifications dans le contenu principal
    setShowNotifications(false);
    setActiveSection("notifications");
    setSelectedNotificationTicket(notification.ticket_id);
    
    // Charger les tickets avec notifications
    await loadNotificationsTickets();
  }

  // Charger les tickets avec notifications quand la vue s'ouvre
  useEffect(() => {
    if ((activeSection === "notifications" || showNotificationsTicketsView) && notifications.length > 0) {
      void loadNotificationsTickets();
    }
  }, [activeSection, showNotificationsTicketsView, notifications.length]);

  // Charger automatiquement les détails du ticket sélectionné dans la section notifications
  useEffect(() => {
    if (activeSection === "notifications" && selectedNotificationTicket) {
      async function loadDetails() {
        try {
          const res = await fetch(`http://localhost:8000/tickets/${selectedNotificationTicket}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            setSelectedNotificationTicketDetails(data);
            if (selectedNotificationTicket) {
              await loadTicketHistory(selectedNotificationTicket);
            }
          }
        } catch (err) {
          console.error("Erreur chargement détails:", err);
        }
      }
      void loadDetails();
    }
  }, [activeSection, selectedNotificationTicket, token]);

  // Scroll vers le haut quand la section notifications s'ouvre
  useEffect(() => {
    if (activeSection === "notifications") {
      // Attendre un peu pour que le DOM soit mis à jour
      setTimeout(() => {
        // Scroller vers le haut de la fenêtre
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Aussi scroller vers le conteneur de la section notifications si disponible
        if (notificationsSectionRef.current) {
          notificationsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
    }
  }, [activeSection]);


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

  const matchesFilters = (t: Ticket) => {
    if (statusFilter !== "all" && t.status !== statusFilter) {
      return false;
    }

    if (priorityFilter !== "all" && t.priority !== priorityFilter) {
      return false;
    }

    if (typeFilter !== "all" && t.type !== typeFilter) {
      return false;
    }

    if (dateFilter !== "all") {
      if (!t.assigned_at) {
        return false;
      }
      const assignedDate = new Date(t.assigned_at);
      const now = new Date();

      if (dateFilter === "today") {
        if (assignedDate.toDateString() !== now.toDateString()) {
          return false;
        }
      } else if (dateFilter === "last7") {
        const diffMs = now.getTime() - assignedDate.getTime();
        if (diffMs > 7 * 24 * 60 * 60 * 1000) {
          return false;
        }
      } else if (dateFilter === "last30") {
        const diffMs = now.getTime() - assignedDate.getTime();
        if (diffMs > 30 * 24 * 60 * 60 * 1000) {
          return false;
        }
      }
    }

    return true;
  };

  const filteredAssignedTickets = assignedTickets.filter(matchesFilters);
  const filteredInProgressTickets = inProgressTickets.filter(matchesFilters);

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
  const rejectedCount = rejectedTickets.length;
  const ticketsToResolveCount = assignedCount + inProgressCount;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif", background: "#f5f5f5" }}>
      {/* Sidebar */}
      <div style={{ 
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: sidebarCollapsed ? "80px" : "250px", 
        background: "#1e293b", 
        color: "white", 
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        transition: "width 0.3s ease",
        overflowY: "auto",
        zIndex: 100
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: "30px",
          paddingBottom: "10px",
          borderBottom: "1px solid rgba(255,255,255,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 7L12 3L20 7V17L12 21L4 17V7Z" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
                <path d="M4 7L12 11L20 7" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 11V21" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div style={{ fontSize: "18px", fontWeight: "600", whiteSpace: "nowrap" }}>
                Gestion d'Incidents
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "4px",
                marginLeft: "8px",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <PanelLeft size={20} color="white" />
            </div>
          )}
          {sidebarCollapsed && (
            <div
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "4px",
                margin: "0 auto",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <PanelLeft size={20} color="white" style={{ transform: "rotate(180deg)" }} />
            </div>
          )}
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div>Tableau de Bord</div>
        </div>
        {/* Tickets en cours */}
        <div 
          onClick={() => setActiveSection("tickets-en-cours")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            background: activeSection === "tickets-en-cours" ? "rgba(255,255,255,0.1)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>Tickets en cours</div>
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
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="8 12 11 15 16 9"></polyline>
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
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Tickets Rejetés</span>
            {rejectedCount > 0 && (
              <span
                style={{
                  minWidth: "18px",
                  padding: "0 6px",
                  height: "18px",
                  borderRadius: "999px",
                  background: "#ef4444",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "white",
                }}
              >
                {rejectedCount > 99 ? "99+" : rejectedCount}
              </span>
            )}
          </div>
        </div>

        {/* Bouton Déconnexion */}
        <div
          onClick={handleLogout}
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "8px",
            cursor: "pointer",
            color: "white",
            transition: "background 0.2s",
          }}
        >
          <div
            style={{
              width: "20px",
              height: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="16 17 21 12 16 7"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="21"
                y1="12"
                x2="9"
                y2="12"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ fontSize: "14px", color: "white" }}>Déconnexion</div>
        </div>

        {/* Bottom user block in sidebar */}
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "14px",
              fontWeight: 600
            }}>
              {(userInfo?.full_name || "Utilisateur").charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ color: "white", fontSize: "14px" }}>
                {userInfo?.full_name || "Utilisateur"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }}></div>
                <div style={{ color: "white", fontSize: "12px" }}>En ligne</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        display: "flex", 
        flexDirection: "column", 
        overflow: "hidden",
        marginLeft: sidebarCollapsed ? "80px" : "250px",
        transition: "margin-left 0.3s ease"
      }}>
        {/* Barre de navigation en haut */}
        <div style={{
          position: "fixed",
          top: 0,
          left: sidebarCollapsed ? "80px" : "250px",
          right: 0,
          background: "#1e293b",
          padding: "16px 30px",
          borderBottom: "1px solid #0f172a",
          zIndex: 99,
          transition: "left 0.3s ease"
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Partie gauche - Titre */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "18px", fontWeight: "600", color: "white" }}>
              </div>
            </div>
            
            {/* Partie droite - Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* Message de bienvenue */}
              {userInfo && (
                <span
                  style={{
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "400",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    marginRight: "8px",
                  }}
                >
                  Bienvenue Dans Votre Espace Technicien, {userInfo.full_name.toUpperCase()}
                </span>
              )}

              {/* Icône boîte de réception - tickets à résoudre */}
              <div
                style={{
                  cursor: "default",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  position: "relative",
                  opacity: ticketsToResolveCount > 0 ? 1 : 0.5,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="6" width="16" height="12" rx="1" />
                  <circle cx="4" cy="10" r="1" fill="white" />
                  <circle cx="4" cy="14" r="1" fill="white" />
                  <circle cx="20" cy="10" r="1" fill="white" />
                  <circle cx="20" cy="14" r="1" fill="white" />
                </svg>
                {ticketsToResolveCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      minWidth: "18px",
                      height: "18px",
                      background: "#22c55e",
                      borderRadius: "50%",
                      border: "2px solid #1e293b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: "bold",
                      color: "white",
                      padding: "0 4px",
                    }}
                  >
                    {ticketsToResolveCount > 99 ? "99+" : ticketsToResolveCount}
                  </span>
                )}
              </div>

              {/* Cloche notifications */}
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
            </div>
          </div>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: activeSection === "notifications" ? "hidden" : "auto", paddingTop: "80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {activeSection === "dashboard" && (
              <div style={{ marginTop: "8px", marginBottom: "20px" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                  Mes Interventions
                </div>
                <div style={{ fontSize: "15px", color: "#4b5563" }}>
                  Traitez vos tickets et aidez vos collègues
                </div>
              </div>
            )}
            {activeSection === "dashboard" && (
              <>
                <h2></h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "16px",
                    alignItems: "stretch",
                    margin: "0 0 24px",
                  }}
                >
                  {/* KPI Tickets assignés */}
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      padding: "14px",
                      borderRadius: "12px",
                      background: "white",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      minHeight: "100px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "#e0edff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ClipboardList size={16} color="#2563eb" />
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "28px",
                        fontWeight: "bold",
                        color: "#111827",
                        marginBottom: "4px",
                      }}
                    >
                      {assignedCount}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#374151",
                      }}
                    >
                      Tickets assignés
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "2px",
                      }}
                    >
                      Nouveaux tickets reçus
                    </span>
                  </div>

                  {/* KPI Tickets en cours */}
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      padding: "14px",
                      borderRadius: "12px",
                      background: "white",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      minHeight: "100px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "#fff4e6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Clock3 size={16} color="#ea580c" />
                  </div>
                  </div>
                    <span
                      style={{
                        fontSize: "28px",
                        fontWeight: "bold",
                        color: "#111827",
                        marginBottom: "4px",
                      }}
                    >
                      {inProgressCount}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#374151",
                      }}
                    >
                      Tickets en cours
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "2px",
                      }}
                    >
                      En cours de traitement
                    </span>
                  </div>

                  {/* KPI Tickets résolus */}
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      padding: "14px",
                      borderRadius: "12px",
                      background: "white",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                      minHeight: "100px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "#dcfce7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <CheckCircle2 size={16} color="#16a34a" />
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "28px",
                        fontWeight: "bold",
                        color: "#111827",
                        marginBottom: "4px",
                      }}
                    >
                      {resolvedCount}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#374151",
                      }}
                    >
                      Tickets résolus
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "2px",
                      }}
                    >
                      Aujourd'hui
                    </span>
                  </div>
                </div>

                <h3 style={{ marginTop: "32px" }}>Mes tickets assignés</h3>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    margin: "12px 0 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "#374151",
                      marginRight: "4px",
                      alignSelf: "center",
                    }}
                  >
                    Filtrer par :
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                      background: "white",
                    }}
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="assigne_technicien">Assigné</option>
                    <option value="en_cours">En cours</option>
                    <option value="resolu">Résolu</option>
                    <option value="rejete">Rejeté</option>
                  </select>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                      background: "white",
                    }}
                  >
                    <option value="all">Toutes les priorités</option>
                    <option value="critique">Critique</option>
                    <option value="haute">Haute</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="faible">Faible</option>
                  </select>

                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "13px",
                      background: "white",
                    }}
                  >
                    <option value="all">Toutes les dates</option>
                    <option value="today">Aujourd'hui</option>
                    <option value="last7">7 derniers jours</option>
                    <option value="last30">30 derniers jours</option>
                  </select>

                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid " +
                        "#d1d5db",
                      fontSize: "13px",
                      background: "white",
                    }}
                  >
                    <option value="all">Toutes les catégories</option>
                    <option value="materiel">Matériel</option>
                    <option value="applicatif">Applicatif</option>
                  </select>
                </div>
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
                    {filteredAssignedTickets.length === 0 && filteredInProgressTickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "20px", color: "#999" }}>
                          Aucun ticket assigné
                        </td>
                      </tr>
                    ) : (
                      <>
                        {filteredAssignedTickets.map((t) => (
                          <tr key={t.id}>
                            <td>#{t.number}</td>
                            <td>{t.title}</td>
                            <td>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
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
                                background: "#f0f9ff",
                                color: "#0c4a6e",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                Assigné
                              </span>
                            </td>
                            <td>{t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    const isOpen = openActionsMenuFor === t.id;
                                    if (isOpen) {
                                      setOpenActionsMenuFor(null);
                                      setActionsMenuPosition(null);
                                      return;
                                    }

                                    const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const menuWidth = 220;
                                    const menuHeight = 180; // Hauteur approximative du menu (4 boutons)
                                    const viewportHeight = window.innerHeight;
                                    const viewportWidth = window.innerWidth;

                                    // Toujours essayer d'afficher le menu en dessous du bouton d'abord
                                    let top = buttonRect.bottom + 4;
                                    const spaceBelow = viewportHeight - buttonRect.bottom - 8;
                                    const spaceAbove = buttonRect.top - 8;

                                    // Si pas assez de place en dessous ET plus de place au-dessus, afficher au-dessus
                                    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
                                      top = buttonRect.top - menuHeight - 4;
                                    } else if (spaceBelow < menuHeight) {
                                      // Si pas assez de place ni en dessous ni au-dessus, ajuster pour rester visible
                                      if (spaceBelow < menuHeight) {
                                        top = Math.max(8, viewportHeight - menuHeight - 8);
                                      }
                                    }

                                    // S'assurer que le menu ne dépasse pas en bas
                                    if (top + menuHeight > viewportHeight - 8) {
                                      top = viewportHeight - menuHeight - 8;
                                    }

                                    // Positionner horizontalement - aligner à droite du bouton
                                    let left = buttonRect.right - menuWidth;
                                    if (left < 8) {
                                      left = buttonRect.left;
                                    }
                                    if (left + menuWidth > viewportWidth - 8) {
                                      left = viewportWidth - menuWidth - 8;
                                    }

                                    setActionsMenuPosition({ top, left });
                                    setOpenActionsMenuFor(t.id);
                                  }}
                                  disabled={loading}
                                  title="Actions"
                                  aria-label="Actions"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "transparent",
                                    border: "none",
                                    borderRadius: 0,
                                    cursor: "pointer",
                                    color: "#475569",
                                    backgroundImage:
                                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                    backgroundSize: "18px 18px"
                                  }}
                                />
                                {openActionsMenuFor === t.id && actionsMenuPosition && (
                                  <div
                                    style={{
                                      position: "fixed",
                                      top: actionsMenuPosition.top,
                                      left: actionsMenuPosition.left,
                                      background: "white",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                      minWidth: 220,
                                      zIndex: 2000
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Voir le ticket
                                </button>
                                <button
                                      onClick={() => { handleTakeCharge(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                >
                                  Prendre en charge
                                </button>
                                <button
                                      onClick={() => { setSelectedTicket(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                >
                                  Ajouter commentaire
                                </button>
                                <button
                                      onClick={() => { setRequestInfoTicket(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                >
                                  Demander info
                                </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredInProgressTickets.map((t) => (
                          <tr key={t.id}>
                            <td>#{t.number}</td>
                            <td>{t.title}</td>
                            <td>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                                color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: "#fed7aa",
                                color: "#9a3412",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                whiteSpace: "nowrap"
                              }}>
                                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f97316" }}></div>
                                En cours
                              </span>
                            </td>
                            <td>{t.assigned_at ? new Date(t.assigned_at).toLocaleString("fr-FR") : "N/A"}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    const isOpen = openActionsMenuFor === t.id;
                                    if (isOpen) {
                                      setOpenActionsMenuFor(null);
                                      setActionsMenuPosition(null);
                                      return;
                                    }

                                    const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const menuWidth = 220;
                                    const menuHeight = 180; // Hauteur approximative du menu (4 boutons)
                                    const viewportHeight = window.innerHeight;
                                    const viewportWidth = window.innerWidth;

                                    // Toujours essayer d'afficher le menu en dessous du bouton d'abord
                                    let top = buttonRect.bottom + 4;
                                    const spaceBelow = viewportHeight - buttonRect.bottom - 8;
                                    const spaceAbove = buttonRect.top - 8;

                                    // Si pas assez de place en dessous ET plus de place au-dessus, afficher au-dessus
                                    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
                                      top = buttonRect.top - menuHeight - 4;
                                    } else if (spaceBelow < menuHeight) {
                                      // Si pas assez de place ni en dessous ni au-dessus, ajuster pour rester visible
                                      if (spaceBelow < menuHeight) {
                                        top = Math.max(8, viewportHeight - menuHeight - 8);
                                      }
                                    }

                                    // S'assurer que le menu ne dépasse pas en bas
                                    if (top + menuHeight > viewportHeight - 8) {
                                      top = viewportHeight - menuHeight - 8;
                                    }

                                    // Positionner horizontalement - aligner à droite du bouton
                                    let left = buttonRect.right - menuWidth;
                                    if (left < 8) {
                                      left = buttonRect.left;
                                    }
                                    if (left + menuWidth > viewportWidth - 8) {
                                      left = viewportWidth - menuWidth - 8;
                                    }

                                    setActionsMenuPosition({ top, left });
                                    setOpenActionsMenuFor(t.id);
                                  }}
                                  disabled={loading}
                                  title="Actions"
                                  aria-label="Actions"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "transparent",
                                    border: "none",
                                    borderRadius: 0,
                                    cursor: "pointer",
                                    color: "#475569",
                                    backgroundImage:
                                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                    backgroundSize: "18px 18px"
                                  }}
                                />
                                {openActionsMenuFor === t.id && actionsMenuPosition && (
                                  <div
                                    style={{
                                      position: "fixed",
                                      top: actionsMenuPosition.top,
                                      left: actionsMenuPosition.left,
                                      background: "white",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                      minWidth: 220,
                                      zIndex: 2000
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Voir le ticket
                                    </button>
                                    <button
                                      onClick={() => { setSelectedTicket(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Ajouter commentaire
                                    </button>
                                    <button
                                      onClick={() => { setRequestInfoTicket(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Demander info
                                    </button>
                                    <button
                                      onClick={() => { handleMarkResolved(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "none",
                                        background: "white",
                                        textAlign: "left",
                                        fontSize: "13px",
                                        color: "#111827",
                                        cursor: "pointer"
                                      }}
                                    >
                                      Marquer résolu
                                    </button>
                                  </div>
                                )}
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

            {/* Section Tickets en cours */}
            {activeSection === "tickets-en-cours" && (
              <div>
                <h2 style={{ marginBottom: "24px" }}>Tickets en cours</h2>
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
                      {inProgressTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                            Aucun ticket en cours de traitement
                          </td>
                        </tr>
                      ) : (
                        inProgressTickets.map((t) => (
                          <tr key={t.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                            <td style={{ padding: "12px 16px" }}>#{t.number}</td>
                            <td style={{ padding: "12px 16px" }}>{t.title}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: "#fed7aa",
                                color: "#9a3412",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                whiteSpace: "nowrap"
                              }}>
                                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f97316" }}></div>
                                En cours de traitement
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
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
                                  backgroundColor: "#2563eb", 
                                  color: "white", 
                                  border: "none", 
                                  borderRadius: "4px", 
                                  cursor: "pointer" 
                                }}
                              >
                                Détails
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
                                padding: "6px 12px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.status === "resolu" ? "#d4edda" : t.status === "cloture" ? "#e5e7eb" : "#6c757d",
                                color: t.status === "resolu" ? "#155724" : t.status === "cloture" ? "#374151" : "white",
                                whiteSpace: "nowrap",
                                display: "inline-block"
                              }}>
                                {t.status === "resolu" ? "Résolu" : t.status === "cloture" ? "Clôturé" : t.status}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
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
                                padding: "6px 12px",
                                borderRadius: "20px",
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
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
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

            {/* Section Notifications dans le contenu principal */}
            {activeSection === "notifications" && (
              <div ref={notificationsSectionRef} style={{
                display: "flex",
                width: "100%",
                height: "calc(100vh - 80px)",
                marginTop: "-30px",
                marginLeft: "-30px",
                marginRight: "-30px",
                marginBottom: "-30px",
                background: "white",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                overflow: "hidden"
              }}>
                {/* Panneau gauche - Liste des tickets avec notifications */}
                <div style={{
                  width: "400px",
                  borderRight: "1px solid #e0e0e0",
                  display: "flex",
                  flexDirection: "column",
                  background: "#f8f9fa",
                  borderRadius: "8px 0 0 8px",
                  height: "100%",
                  overflow: "hidden",
                  flexShrink: 0
                }}>
                  <div style={{
                    padding: "28px 20px 20px 20px",
                    borderBottom: "1px solid #e0e0e0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "white",
                    borderRadius: "8px 0 0 0"
                  }}>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>
                      Tickets avec notifications
                    </h3>
                    <button
                      onClick={() => {
                        setActiveSection("dashboard");
                        setSelectedNotificationTicket(null);
                        setSelectedNotificationTicketDetails(null);
                      }}
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
                    {notificationsTickets.length === 0 ? (
                      <div style={{
                        textAlign: "center",
                        padding: "40px 20px",
                        color: "#999"
                      }}>
                        Aucun ticket avec notification
                      </div>
                    ) : (
                      notificationsTickets.map((ticket: Ticket) => {
                        const ticketNotifications = notifications.filter((n: Notification) => n.ticket_id === ticket.id);
                        const unreadCount = ticketNotifications.filter((n: Notification) => !n.read).length;
                        const isSelected = selectedNotificationTicket === ticket.id;
                        
                        return (
                          <div
                            key={ticket.id}
                            onClick={async () => {
                              setSelectedNotificationTicket(ticket.id);
                              try {
                                const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                  },
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setSelectedNotificationTicketDetails(data);
                                  await loadTicketHistory(ticket.id);
                                }
                              } catch (err) {
                                console.error("Erreur chargement détails:", err);
                              }
                            }}
                            style={{
                              padding: "12px",
                              marginBottom: "8px",
                              borderRadius: "8px",
                              background: isSelected ? "#e3f2fd" : "white",
                              border: isSelected ? "2px solid #2196f3" : "1px solid #e0e0e0",
                              cursor: "pointer",
                              transition: "all 0.2s"
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
                                  fontWeight: isSelected ? "600" : "500",
                                  color: "#333",
                                  lineHeight: "1.5"
                                }}>
                                  Ticket #{ticket.number}
                                </p>
                                <p style={{
                                  margin: "4px 0 0 0",
                                  fontSize: "13px",
                                  color: "#666",
                                  lineHeight: "1.4",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical"
                                }}>
                                  {ticket.title}
                                </p>
                                <p style={{
                                  margin: "4px 0 0 0",
                                  fontSize: "11px",
                                  color: "#999"
                                }}>
                                  {ticketNotifications.length} notification{ticketNotifications.length > 1 ? "s" : ""}
                                </p>
                              </div>
                              {unreadCount > 0 && (
                                <div style={{
                                  minWidth: "20px",
                                  height: "20px",
                                  borderRadius: "10px",
                                  background: "#f44336",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: "600",
                                  padding: "0 6px"
                                }}>
                                  {unreadCount}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Panneau droit - Détails du ticket sélectionné */}
                <div style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  background: "white",
                  borderRadius: "0 8px 8px 0"
                }}>
                  {selectedNotificationTicketDetails ? (
                    <>
                      <div style={{
                        padding: "28px 20px 20px 20px",
                        borderBottom: "1px solid #e0e0e0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "white",
                        borderRadius: "0 8px 0 0"
                      }}>
                        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails du ticket #{selectedNotificationTicketDetails.number}</h3>
                        {selectedNotificationTicketDetails.status === "rejete" && (
                          <span style={{
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: "#fee2e2",
                            color: "#991b1b",
                            whiteSpace: "nowrap",
                            display: "inline-block"
                          }}>
                            Rejeté
                          </span>
                        )}
                      </div>
                      
                      <div style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "20px"
                      }}>
                        <div style={{ marginBottom: "16px" }}>
                          <strong>Titre :</strong>
                          <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px" }}>
                            {selectedNotificationTicketDetails.title}
                          </p>
                        </div>

                        {selectedNotificationTicketDetails.description && (
                          <div style={{ marginBottom: "16px" }}>
                            <strong>Description :</strong>
                            <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px", whiteSpace: "pre-wrap" }}>
                              {selectedNotificationTicketDetails.description}
                            </p>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                          <div>
                            <strong>Type :</strong>
                            <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#e3f2fd", borderRadius: "4px" }}>
                              {selectedNotificationTicketDetails.type === "materiel" ? "Matériel" : "Applicatif"}
                            </span>
                          </div>
                          <div>
                            <strong>Priorité :</strong>
                            <span style={{
                              marginLeft: "8px",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "500",
                              background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "#fed7aa" : selectedNotificationTicketDetails.priority === "moyenne" ? "#dbeafe" : "#9e9e9e",
                              color: selectedNotificationTicketDetails.priority === "haute" ? "#92400e" : selectedNotificationTicketDetails.priority === "moyenne" ? "#1e40af" : "white"
                            }}>
                              {selectedNotificationTicketDetails.priority}
                            </span>
                          </div>
                          <div>
                            <strong>Statut :</strong>
                            <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                              {selectedNotificationTicketDetails.status}
                            </span>
                          </div>
                          {selectedNotificationTicketDetails.category && (
                            <div>
                              <strong>Catégorie :</strong>
                              <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                                {selectedNotificationTicketDetails.category}
                              </span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                          {selectedNotificationTicketDetails.creator && (
                            <div>
                              <strong>Créateur :</strong>
                              <p style={{ marginTop: "4px" }}>
                                {selectedNotificationTicketDetails.creator.full_name}
                                {selectedNotificationTicketDetails.creator.agency && ` - ${selectedNotificationTicketDetails.creator.agency}`}
                              </p>
                            </div>
                          )}
                          {selectedNotificationTicketDetails.technician && (
                            <div>
                              <strong>Technicien assigné :</strong>
                              <p style={{ marginTop: "4px" }}>
                                {selectedNotificationTicketDetails.technician.full_name}
                              </p>
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: "24px", marginBottom: "16px" }}>
                          <strong>Historique :</strong>
                          <div style={{ marginTop: "8px" }}>
                            {ticketHistory.length === 0 ? (
                              <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>
                            ) : (
                              ticketHistory.map((h: TicketHistory) => (
                                <div key={h.id} style={{ padding: "8px", marginTop: "4px", background: "#f8f9fa", borderRadius: "4px" }}>
                                  <div style={{ fontSize: "12px", color: "#555" }}>
                                    {new Date(h.changed_at).toLocaleString("fr-FR")}
                                  </div>
                                  <div style={{ marginTop: "4px", fontWeight: 500 }}>
                                    {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                                  </div>
                                  {h.user && (
                                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                                      Par: {h.user.full_name}
                                    </div>
                                  )}
                                  {h.reason && (
                                    <div style={{ marginTop: "4px", color: "#666" }}>Résumé de la résolution: {h.reason}</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#999"
                    }}>
                      Sélectionnez un ticket pour voir les détails
                    </div>
                  )}
                </div>
          </div>
      )}

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

            <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
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
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "500",
                  background: ticketDetails.priority === "critique" ? "#f44336" : ticketDetails.priority === "haute" ? "#fed7aa" : ticketDetails.priority === "moyenne" ? "#dbeafe" : "#9e9e9e",
                  color: ticketDetails.priority === "haute" ? "#92400e" : ticketDetails.priority === "moyenne" ? "#1e40af" : "white"
                }}>
                  {ticketDetails.priority}
                </span>
              </div>
              <div>
                <strong>Catégorie :</strong>
                <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                  {ticketDetails.category || "Non spécifiée"}
                </span>
              </div>
            </div>

            {ticketDetails.status === "rejete" && (
              <div style={{ marginBottom: "16px" }}>
                <strong>Motif du rejet :</strong>
                <p style={{ marginTop: "4px", padding: "8px", background: "#fff5f5", borderRadius: "4px", color: "#991b1b" }}>
                  {(() => {
                    const entry = ticketHistory.find((h: TicketHistory) => h.new_status === "rejete" && h.reason);
                    if (!entry || !entry.reason) return "Motif non fourni";
                    return entry.reason.includes("Motif:") ? (entry.reason.split("Motif:").pop() || "").trim() : entry.reason;
                  })()}
                </p>
                {(() => {
                  const entry = ticketHistory.find((h: TicketHistory) => h.new_status === "rejete");
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

            <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              {ticketDetails.creator && (
                <div>
                  <strong>Créateur :</strong>
                  <p style={{ marginTop: "4px" }}>
                    {ticketDetails.creator.full_name}
                    {ticketDetails.creator.agency && ` - ${ticketDetails.creator.agency}`}
                  </p>
                </div>
              )}
              {ticketDetails.technician && (
                <div>
                  <strong>Technicien assigné :</strong>
                  <p style={{ marginTop: "4px" }}>
                    {ticketDetails.technician.full_name}
                  </p>
                </div>
              )}
            </div>

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
                  ticketHistory.map((h: TicketHistory) => (
                    <div key={h.id} style={{ padding: "8px", marginTop: "4px", background: "#f8f9fa", borderRadius: "4px" }}>
                      <div style={{ fontSize: "12px", color: "#555" }}>
                        {new Date(h.changed_at).toLocaleString("fr-FR")}
                      </div>
                      <div style={{ marginTop: "4px", fontWeight: 500 }}>
                        {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                      </div>
                      {h.user && (
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                          Par: {h.user.full_name}
                        </div>
                      )}
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
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={clearAllNotifications}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#1f6feb",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "6px 8px"
                  }}
                >
                  Effacer les notifications
                </button>
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
                notifications.map((notif: Notification) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (notif.ticket_id) {
                        void handleNotificationClick(notif);
                      } else {
                        if (!notif.read) {
                          void markNotificationAsRead(notif.id);
                        }
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
        </div>

      {/* Interface split-view pour les tickets avec notifications */}
      {showNotificationsTicketsView && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          zIndex: 1001
        }}>
          <div style={{
            display: "flex",
            width: "100%",
            height: "100vh",
            background: "white",
            overflow: "hidden"
          }}>
            {/* Panneau gauche - Liste des tickets avec notifications */}
            <div style={{
              width: "400px",
              borderRight: "1px solid #e0e0e0",
              display: "flex",
              flexDirection: "column",
              background: "#f8f9fa",
              height: "100%",
              overflow: "hidden",
              flexShrink: 0
            }}>
              <div style={{
                padding: "28px 20px 10px 20px",
                borderBottom: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "white"
              }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333", lineHeight: "1.4" }}>
                  Tickets avec notifications
                </h3>
                <button
                  onClick={() => {
                    setShowNotificationsTicketsView(false);
                    setSelectedNotificationTicket(null);
                    setSelectedNotificationTicketDetails(null);
                  }}
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
                padding: "5px 10px 10px 10px"
              }}>
                {notificationsTickets.length === 0 ? (
                  <div style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    color: "#999"
                  }}>
                    Aucun ticket avec notification
                  </div>
                ) : (
                  notificationsTickets.map((ticket: Ticket) => {
                    const ticketNotifications = notifications.filter((n: Notification) => n.ticket_id === ticket.id);
                    const unreadCount = ticketNotifications.filter((n: Notification) => !n.read).length;
                    const isSelected = selectedNotificationTicket === ticket.id;
                    
                    return (
                      <div
                        key={ticket.id}
                        onClick={async () => {
                          setSelectedNotificationTicket(ticket.id);
                          try {
                            const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
                              headers: {
                                Authorization: `Bearer ${token}`,
                              },
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setSelectedNotificationTicketDetails(data);
                              await loadTicketHistory(ticket.id);
                            }
                          } catch (err) {
                            console.error("Erreur chargement détails:", err);
                          }
                        }}
                        style={{
                          padding: "12px",
                          marginBottom: "8px",
                          borderRadius: "8px",
                          background: isSelected ? "#e3f2fd" : "white",
                          border: isSelected ? "2px solid #2196f3" : "1px solid #e0e0e0",
                          cursor: "pointer",
                          transition: "all 0.2s"
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
                              fontWeight: isSelected ? "600" : "500",
                              color: "#333",
                              lineHeight: "1.5"
                            }}>
                              Ticket #{ticket.number}
                            </p>
                            <p style={{
                              margin: "4px 0 0 0",
                              fontSize: "13px",
                              color: "#666",
                              lineHeight: "1.4",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical"
                            }}>
                              {ticket.title}
                            </p>
                            <p style={{
                              margin: "4px 0 0 0",
                              fontSize: "11px",
                              color: "#999"
                            }}>
                              {ticketNotifications.length} notification{ticketNotifications.length > 1 ? "s" : ""}
                            </p>
                          </div>
                          {unreadCount > 0 && (
                            <div style={{
                              minWidth: "20px",
                              height: "20px",
                              borderRadius: "10px",
                              background: "#f44336",
                              color: "white",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              fontWeight: "600",
                              padding: "0 6px"
                            }}>
                              {unreadCount}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Panneau droit - Détails du ticket sélectionné */}
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "white"
            }}>
              {selectedNotificationTicketDetails ? (
                <>
                  <div style={{
                    padding: "28px 20px 10px 20px",
                    borderBottom: "1px solid #e0e0e0",
                    background: "white"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333", lineHeight: "1.4" }}>Détails du ticket #{selectedNotificationTicketDetails.number}</h3>
                      {selectedNotificationTicketDetails.status === "rejete" && (
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
                  </div>
                  
                    <div style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "10px 20px 20px 20px"
                    }}>
                    <div style={{ marginBottom: "16px" }}>
                      <strong>Titre :</strong>
                      <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px" }}>
                        {selectedNotificationTicketDetails.title}
                      </p>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <strong>Description :</strong>
                      <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px", whiteSpace: "pre-wrap" }}>
                        {selectedNotificationTicketDetails.description}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                      <div>
                        <strong>Type :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#e3f2fd", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.type === "materiel" ? "Matériel" : "Applicatif"}
                        </span>
                      </div>
                      <div>
                        <strong>Priorité :</strong>
                        <span style={{
                          marginLeft: "8px",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "500",
                          background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "#fed7aa" : selectedNotificationTicketDetails.priority === "moyenne" ? "#dbeafe" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "haute" ? "#92400e" : selectedNotificationTicketDetails.priority === "moyenne" ? "#1e40af" : "white"
                        }}>
                          {selectedNotificationTicketDetails.priority}
                        </span>
                      </div>
                      <div>
                        <strong>Statut :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.status}
                        </span>
                      </div>
                    </div>

                    {selectedNotificationTicketDetails.category && (
                      <div style={{ marginBottom: "16px" }}>
                        <strong>Catégorie :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.category}
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
                      {selectedNotificationTicketDetails.creator && (
                        <div>
                          <strong>Créateur :</strong>
                          <p style={{ marginTop: "4px" }}>
                            {selectedNotificationTicketDetails.creator.full_name}
                            {selectedNotificationTicketDetails.creator.agency && ` - ${selectedNotificationTicketDetails.creator.agency}`}
                          </p>
                        </div>
                      )}
                      {selectedNotificationTicketDetails.technician && (
                        <div>
                          <strong>Technicien assigné :</strong>
                          <p style={{ marginTop: "4px" }}>
                            {selectedNotificationTicketDetails.technician.full_name}
                          </p>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: "24px", marginBottom: "16px" }}>
                      <strong>Historique :</strong>
                      <div style={{ marginTop: "8px" }}>
                        {ticketHistory.length === 0 ? (
                          <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>
                        ) : (
                          ticketHistory.map((h: TicketHistory) => (
                            <div key={h.id} style={{ padding: "8px", marginTop: "4px", background: "#f8f9fa", borderRadius: "4px" }}>
                              <div style={{ fontSize: "12px", color: "#555" }}>
                                {new Date(h.changed_at).toLocaleString("fr-FR")}
                              </div>
                              <div style={{ marginTop: "4px", fontWeight: 500 }}>
                                {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                              </div>
                              {h.user && (
                                <div style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                                  Par: {h.user.full_name}
                                </div>
                              )}
                              {h.reason && (
                                <div style={{ marginTop: "4px", color: "#666" }}>Résumé de la résolution: {h.reason}</div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999"
                }}>
                  Sélectionnez un ticket pour voir les détails
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default TechnicianDashboard;
