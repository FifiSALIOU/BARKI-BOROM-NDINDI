import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelLeft, ClipboardList, Clock3, CheckCircle2, LayoutDashboard, ChevronLeft, ChevronRight, Bell, Search, Box, Clock, Monitor, Wrench } from "lucide-react";
import helpdeskLogo from "../assets/helpdesk-logo.png";

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
  role?: {
    name: string;
  } | null;
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
  resolved_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
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
  const [showTicketDetailsPage, setShowTicketDetailsPage] = useState<boolean>(false);
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
  const [ticketSearchQuery, setTicketSearchQuery] = useState<string>("");

  // Fonction pour obtenir le libellé d'une priorité
  function getPriorityLabel(priority: string): string {
    switch (priority) {
      case "faible": return "Faible";
      case "moyenne": return "Moyenne";
      case "haute": return "Haute";
      case "critique": return "Critique";
      default: return priority;
    }
  }

  // Fonction helper pour formater le numéro de ticket en "TKT-XXX"
  const formatTicketNumber = (number: number): string => {
    return `TKT-${number.toString().padStart(3, '0')}`;
  };

  // Fonction helper pour obtenir les initiales
  const getInitials = (name: string) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

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

  async function loadTickets(searchTerm?: string) {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const url = new URL("http://localhost:8000/tickets/assigned");
      if (searchTerm && searchTerm.trim() !== "") {
        url.searchParams.append("search", searchTerm.trim());
      }
      
      const res = await fetch(url.toString(), {
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

  useEffect(() => {
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
            role: meData.role,
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
      void loadTickets(ticketSearchQuery);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [token]);

  // Debounce pour la recherche de tickets
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadTickets(ticketSearchQuery);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [ticketSearchQuery, token]);

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

  // Calculer le temps moyen de résolution (en heures)
  const calculateAverageResolutionTime = () => {
    const resolvedTicketsWithTime = resolvedTickets.filter((t) => {
      const startTime = t.assigned_at || t.created_at;
      const endTime = t.closed_at || t.resolved_at;
      return startTime && endTime;
    });

    if (resolvedTicketsWithTime.length === 0) {
      return 0;
    }

    const totalHours = resolvedTicketsWithTime.reduce((sum, t) => {
      const startTime = new Date(t.assigned_at || t.created_at || "");
      const endTime = new Date(t.closed_at || t.resolved_at || "");
      const diffMs = endTime.getTime() - startTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return sum + diffHours;
    }, 0);

    return Math.round((totalHours / resolvedTicketsWithTime.length) * 10) / 10; // Arrondir à 1 décimale
  };

  const averageResolutionTime = calculateAverageResolutionTime();

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: "#f5f5f5", overflowX: "visible" }}>
      {/* Sidebar */}
      <div style={{ 
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: sidebarCollapsed ? "80px" : "250px", 
        background: "hsl(226, 34%, 15%)", 
        color: "white", 
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "0px",
        transition: "width 0.3s ease",
        overflowY: "auto",
        overflowX: "visible",
        zIndex: 100,
        boxSizing: "border-box"
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: "8px",
          paddingBottom: "8px",
          borderBottom: "1px solid rgba(255,255,255,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
            <div style={{ width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: "white", borderRadius: "0.75rem", padding: "2px" }}>
              <img 
                src={helpdeskLogo} 
                alt="HelpDesk Logo" 
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  objectFit: "contain",
                  borderRadius: "0.5rem"
                }} 
              />
            </div>
            {!sidebarCollapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "18px", fontWeight: "700", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: "white", whiteSpace: "nowrap" }}>
                  HelpDesk
                </div>
                <div style={{ fontSize: "12px", fontFamily: "'Inter', system-ui, sans-serif", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", marginTop: "2px" }}>
                  Gestion des tickets
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Bouton de collapse/expand du sidebar */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            position: "fixed",
            left: sidebarCollapsed ? "calc(80px - 14px)" : "calc(250px - 14px)",
            top: "75px",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "hsl(25, 95%, 53%)",
            border: "2px solid white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 1000,
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            transition: "all 0.3s ease",
            padding: 0,
            boxSizing: "border-box",
            overflow: "visible"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.background = "hsl(25, 95%, 48%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.background = "hsl(25, 95%, 53%)";
          }}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={14} color="white" />
          ) : (
            <ChevronLeft size={14} color="white" />
          )}
        </button>
        
        {/* Profil utilisateur */}
        {!sidebarCollapsed && userInfo && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 0",
            marginBottom: "12px",
            borderBottom: "1px solid rgba(255,255,255,0.1)"
          }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "hsl(25, 95%, 53%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: "600",
              fontSize: "16px",
              flexShrink: 0
            }}>
              {userInfo.full_name
                ? userInfo.full_name
                    .split(" ")
                    .map(n => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "T"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "16px",
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "white",
                fontWeight: "500",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {userInfo.full_name || "Utilisateur"}
              </div>
              <div style={{
                fontSize: "12px",
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "hsl(25, 95%, 53%)",
                fontWeight: "500",
                marginTop: "2px"
              }}>
                {userInfo.role?.name || "Technicien"}
              </div>
            </div>
          </div>
        )}
        
        <div 
          onClick={() => setActiveSection("dashboard")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "dashboard" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={18} color={activeSection === "dashboard" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tableau de Bord</div>
        </div>
        
        {/* Tickets en cours */}
        <div 
          onClick={() => setActiveSection("tickets-en-cours")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "tickets-en-cours" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeSection === "tickets-en-cours" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tickets en cours</div>
        </div>
        <div 
          onClick={() => setActiveSection("tickets-resolus")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "tickets-resolus" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeSection === "tickets-resolus" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="8 12 11 15 16 9"></polyline>
            </svg>
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tickets Résolus</div>
        </div>
        <div 
          onClick={() => setActiveSection("tickets-rejetes")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "tickets-rejetes" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeSection === "tickets-rejetes" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500", color: activeSection === "tickets-rejetes" ? "white" : "inherit" }}>Tickets Rejetés</span>
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
        <div 
          onClick={() => setActiveSection("actifs")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "actifs" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background 0.2s",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Box size={18} color={activeSection === "actifs" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Actifs</div>
        </div>

        {/* Section Notifications + Déconnexion en bas */}
        <div style={{ marginTop: "auto" }}>
          {/* Bouton Notifications */}
          <div
            onClick={() => setActiveSection("notifications")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              color: "white",
              transition: "background 0.2s",
              position: "relative"
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
              <Bell size={20} color="rgba(180, 180, 180, 0.7)" />
            </div>
            <div style={{ fontSize: "14px", color: "white", flex: 1 }}>Notifications</div>
            {unreadCount > 0 && (
              <div style={{
                minWidth: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "hsl(25, 95%, 53%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 600,
                color: "white",
                padding: "0 6px"
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </div>

          {/* Bouton Déconnexion */}
          <div
            onClick={handleLogout}
            style={{
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
          background: "hsl(0, 0%, 100%)",
          padding: "16px 30px",
          borderBottom: "1px solid #e5e7eb",
          zIndex: 99,
          transition: "left 0.3s ease"
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Partie gauche - Titre */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ 
                fontSize: "20px", 
                fontWeight: "700",
                color: "#111827",
                fontFamily: "system-ui, -apple-system, sans-serif"
              }}>
                Tableau de bord
              </div>
              <div style={{ 
                fontSize: "13px", 
                fontWeight: "400",
                color: "#6b7280",
                fontFamily: "system-ui, -apple-system, sans-serif"
              }}>
                Vue d'ensemble de votre activité
              </div>
            </div>
            
            {/* Partie droite - Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>

              {/* Barre de recherche */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                position: "relative",
                width: "300px"
              }}>
                <Search 
                  size={18} 
                  color="#6b7280" 
                  style={{ 
                    position: "absolute", 
                    left: "12px", 
                    pointerEvents: "none",
                    zIndex: 1
                  }} 
                />
                <input
                  type="text"
                  placeholder="Rechercher un ticket..."
                  value={ticketSearchQuery}
                  onChange={(e) => {
                    setTicketSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      loadTickets(ticketSearchQuery);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 38px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    backgroundColor: "#f9fafb",
                    color: "#111827",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.backgroundColor = "#ffffff";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.backgroundColor = "#f9fafb";
                  }}
                />
              </div>

              {/* Icône boîte de réception - tickets à résoudre */}
              <div
                style={{
                  cursor: "default",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#000000",
                  position: "relative",
                  opacity: ticketsToResolveCount > 0 ? 1 : 0.5,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="6" width="16" height="12" rx="1" />
                  <circle cx="4" cy="10" r="1" fill="#000000" />
                  <circle cx="4" cy="14" r="1" fill="#000000" />
                  <circle cx="20" cy="10" r="1" fill="#000000" />
                  <circle cx="20" cy="14" r="1" fill="#000000" />
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
                      border: "2px solid white",
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
                  color: "#000000",
                  position: "relative"
                }}>
                <Bell size={20} color="#000000" />
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    minWidth: "18px",
                    height: "18px",
                    background: "hsl(25, 95%, 53%)",
                    borderRadius: "50%",
                    border: "2px solid white",
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
              <div style={{ marginTop: "32px", marginBottom: "20px" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                  Espace Technicien 🔧
                </div>
                <div style={{ fontSize: "15px", color: "#4b5563" }}>
                  Vos tickets assignés
                </div>
              </div>
            )}
            {activeSection === "dashboard" && (
              <>
                <h2></h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
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
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1.5)";
                    }}
                    onMouseLeave={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1)";
                    }}
                  >
                    {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
                    <div
                      className="kpi-badge-tech"
                      style={{
                        position: "absolute",
                        right: "-16px",
                        top: "-16px",
                        width: "96px",
                        height: "96px",
                        borderRadius: "50%",
                        background: "rgba(255, 138, 60, 0.05)",
                        transition: "transform 500ms ease",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                        zIndex: 1,
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
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1.5)";
                    }}
                    onMouseLeave={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1)";
                    }}
                  >
                    {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
                    <div
                      className="kpi-badge-tech"
                      style={{
                        position: "absolute",
                        right: "-16px",
                        top: "-16px",
                        width: "96px",
                        height: "96px",
                        borderRadius: "50%",
                        background: "rgba(255, 138, 60, 0.05)",
                        transition: "transform 500ms ease",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                        zIndex: 1,
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
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1.5)";
                    }}
                    onMouseLeave={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1)";
                    }}
                  >
                    {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
                    <div
                      className="kpi-badge-tech"
                      style={{
                        position: "absolute",
                        right: "-16px",
                        top: "-16px",
                        width: "96px",
                        height: "96px",
                        borderRadius: "50%",
                        background: "rgba(255, 138, 60, 0.05)",
                        transition: "transform 500ms ease",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                        zIndex: 1,
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

                  {/* KPI Temps moyen de résolution */}
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
                      overflow: "hidden",
                    }}
                    onMouseEnter={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1.5)";
                    }}
                    onMouseLeave={(e) => {
                      const badge = e.currentTarget.querySelector('.kpi-badge-tech') as HTMLElement;
                      if (badge) badge.style.transform = "scale(1)";
                    }}
                  >
                    {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
                    <div
                      className="kpi-badge-tech"
                      style={{
                        position: "absolute",
                        right: "-16px",
                        top: "-16px",
                        width: "96px",
                        height: "96px",
                        borderRadius: "50%",
                        background: "rgba(255, 138, 60, 0.05)",
                        transition: "transform 500ms ease",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-start",
                        width: "100%",
                        marginBottom: "8px",
                        zIndex: 1,
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
                        <Clock3 size={16} color="#2563eb" />
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
                      {resolvedCount > 0 ? `${averageResolutionTime}h` : "0h"}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "#374151",
                      }}
                    >
                      Temps moyen de résolution
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "2px",
                      }}
                    >
                      Par ticket résolu
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
                {/* Tickets Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    overflow: "visible",
                  }}
                >
                    {filteredAssignedTickets.length === 0 && filteredInProgressTickets.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "40px", 
                      color: "#999", 
                      fontWeight: "500",
                      background: "white",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}>
                          Aucun ticket assigné
                    </div>
                    ) : (
                      <>
                      {[...filteredAssignedTickets, ...filteredInProgressTickets].map((t) => {
                        // Fonction helper pour calculer la date relative
                        const getRelativeTime = (date: string | null) => {
                          if (!date) return "N/A";
                          const now = new Date();
                          const past = new Date(date);
                          const diffInMs = now.getTime() - past.getTime();
                          const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                          
                          if (diffInDays === 0) return "aujourd'hui";
                          if (diffInDays === 1) return "il y a 1 jour";
                          return `il y a ${diffInDays} jours`;
                        };

                        // Couleur de la barre selon la priorité
                        const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                           t.priority === "haute" ? "#F59E0B" : 
                                           t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                           "#0DADDB";

                        // Déterminer le statut pour l'affichage
                        const isInProgress = t.status === "en_cours";
                        const statusLabel = isInProgress ? "En cours" : "Assigné";
                        const statusBg = isInProgress ? "rgba(15, 31, 61, 0.1)" : "rgba(255, 122, 27, 0.1)";
                        const statusColor = isInProgress ? "#0F1F3D" : "#FF7A1B";

                        return (
                          <div
                            key={t.id} 
                            onClick={() => loadTicketDetails(t.id)}
                                    style={{
                              position: "relative",
                                      background: "white",
                                borderRadius: "12px",
                              padding: "16px",
                                      border: "1px solid #e5e7eb",
                              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              overflow: "visible",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.15)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
                            }}
                          >
                            {/* Barre de priorité à gauche */}
                            <div
                                      style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: "4px",
                                background: borderColor,
                                borderTopLeftRadius: "12px",
                                borderBottomLeftRadius: "12px",
                              }}
                            />

                            {/* En-tête : ID + Badges + Menu 3 points */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "14px", color: "#1f2937", fontFamily: "monospace", fontWeight: "600" }}>
                                  {formatTicketNumber(t.number)}
                                </span>
                                
                                {/* Badge Statut */}
                              <span style={{
                                  padding: isInProgress ? "2px 10px" : "3px 8px",
                                  borderRadius: "20px",
                                  fontSize: isInProgress ? "12px" : "10px",
                                  fontWeight: "500",
                                  background: statusBg,
                                  color: statusColor,
                                  whiteSpace: "nowrap",
                                  display: isInProgress ? "inline-flex" : "inline-block",
                                  alignItems: isInProgress ? "center" : "auto",
                                  gap: isInProgress ? "6px" : "0",
                                }}>
                                  {isInProgress && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0F1F3D" }}></div>}
                                  {statusLabel}
                                </span>

                                {/* Badge Priorité */}
                                <span style={{
                                  padding: "3px 8px",
                                  borderRadius: "20px",
                                  fontSize: "10px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                                  color: t.priority === "critique" ? "#E53E3E" : t.priority === "haute" ? "#F59E0B" : t.priority === "moyenne" ? "#0DADDB" : t.priority === "faible" ? "#6B7280" : "#374151",
                                  whiteSpace: "nowrap",
                              }}>
                                {getPriorityLabel(t.priority)}
                              </span>

                                {/* Badge Catégorie (si disponible) */}
                                {(() => {
                                  // Déterminer le type de ticket basé sur la catégorie
                                  const category = t.category || "";
                                  const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                                      category.toLowerCase().includes("applicatif") ||
                                                      category.toLowerCase().includes("application");
                                  const categoryType = isApplicatif ? "Applicatif" : "Matériel";
                                  const CategoryIcon = isApplicatif ? Monitor : Wrench;
                                  
                                  return (
                              <span style={{
                                      padding: "3px 8px",
                                      borderRadius: "20px",
                                      fontSize: "10px",
                                fontWeight: "500",
                                      background: "#f3f4f6",
                                      color: "#1f2937",
                                whiteSpace: "nowrap",
                                display: "inline-flex",
                                alignItems: "center",
                                      gap: "4px",
                              }}>
                                      <CategoryIcon size={12} style={{ flexShrink: 0, color: "#1f2937" }} />
                                      <span>{categoryType}</span>
                              </span>
                                  );
                                })()}
                              </div>

                              {/* Menu 3 points */}
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionsMenuFor(openActionsMenuFor === t.id ? null : t.id);
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
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    color: "#475569",
                                    backgroundImage:
                                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                    backgroundSize: "18px 18px",
                                    transition: "background-color 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                />
                                {openActionsMenuFor === t.id && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "100%",
                                      right: 0,
                                      marginTop: "4px",
                                      background: "white",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                      minWidth: 220,
                                      zIndex: 1000,
                                      overflow: "visible"
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    ref={(el) => {
                                      if (el) {
                                        const button = el.previousElementSibling as HTMLElement;
                                        if (button) {
                                          const rect = button.getBoundingClientRect();
                                          const viewportHeight = window.innerHeight;
                                          const menuHeight = isInProgress ? 180 : 220;
                                          const spaceBelow = viewportHeight - rect.bottom;
                                          const spaceAbove = rect.top;
                                          
                                          if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
                                            el.style.bottom = "100%";
                                            el.style.top = "auto";
                                            el.style.marginBottom = "4px";
                                            el.style.marginTop = "0";
                                          } else {
                                            el.style.top = "100%";
                                            el.style.bottom = "auto";
                                            el.style.marginTop = "4px";
                                            el.style.marginBottom = "0";
                                          }
                                        }
                                      }
                                    }}
                                  >
                                    <button
                                      onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px", 
                                        background: "transparent", 
                                        border: "none",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        color: "#111827",
                                        fontSize: "14px",
                                        display: "block",
                                        whiteSpace: "nowrap"
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Voir le ticket
                                </button>
                                    {!isInProgress && (
                                <button
                                      onClick={() => { handleTakeCharge(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                          padding: "10px 12px", 
                                          background: "transparent", 
                                        border: "none",
                                          borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                          cursor: "pointer",
                                        color: "#111827",
                                          fontSize: "14px",
                                          display: "block",
                                          whiteSpace: "nowrap"
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = "#f3f4f6";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                >
                                  Prendre en charge
                                </button>
                                    )}
                                <button
                                      onClick={() => { setSelectedTicket(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px", 
                                        background: "transparent", 
                                        border: "none",
                                        borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        color: "#111827",
                                        fontSize: "14px",
                                        display: "block",
                                        whiteSpace: "nowrap"
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                >
                                  Ajouter commentaire
                                </button>
                                <button
                                      onClick={() => { setRequestInfoTicket(t.id); setOpenActionsMenuFor(null); }}
                                  disabled={loading}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px", 
                                        background: "transparent", 
                                        border: "none",
                                        borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        color: "#111827",
                                        fontSize: "14px",
                                        display: "block",
                                        whiteSpace: "nowrap"
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                >
                                  Demander info
                                </button>
                                    {isInProgress && (
                                    <button
                                      onClick={() => { handleMarkResolved(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                          padding: "10px 12px", 
                                          background: "transparent", 
                                        border: "none",
                                          borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                          cursor: "pointer",
                                        color: "#111827",
                                          fontSize: "14px",
                                          display: "block",
                                          whiteSpace: "nowrap"
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = "#f3f4f6";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Marquer résolu
                                    </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Titre du ticket */}
                            <h4 style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "#1f2937",
                              marginBottom: "6px",
                              lineHeight: "1.3",
                            }}>
                              {t.title}
                            </h4>

                            {/* Description du ticket */}
                            <p style={{
                              fontSize: "13px",
                              color: "#6b7280",
                              marginBottom: "12px",
                              lineHeight: "1.4",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}>
                              {t.description || "Aucune description"}
                            </p>

                            {/* Pied de carte : Créateur, Date, Assigné */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {/* Avatar + Nom créateur */}
                                {t.creator && (
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <div style={{
                                      width: "28px",
                                      height: "28px",
                                      borderRadius: "50%",
                                      background: "#e5e7eb",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      color: "#374151",
                                    }}>
                                      {getInitials(t.creator.full_name || "Inconnu")}
                                    </div>
                                    <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                      {t.creator.full_name || "Inconnu"}
                                    </span>
                                  </div>
                                )}

                                {/* Date relative */}
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={12} color="#9ca3af" />
                                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                    {getRelativeTime(t.assigned_at || t.created_at || null)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      </>
                    )}
                </div>
              </>
            )}

            {/* Section Tickets en cours */}
            {activeSection === "tickets-en-cours" && (
              <div style={{ marginTop: "24px" }}>
                {/* Tickets Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    overflow: "visible",
                  }}
                >
                  {inProgressTickets.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "40px", 
                      color: "#999", 
                                fontWeight: "500",
                      background: "white",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}>
                      Aucun ticket en cours de traitement
                    </div>
                  ) : (
                    inProgressTickets.map((t) => {
                      // Fonction helper pour calculer la date relative
                      const getRelativeTime = (date: string | null) => {
                        if (!date) return "N/A";
                        const now = new Date();
                        const past = new Date(date);
                        const diffInMs = now.getTime() - past.getTime();
                        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                        
                        if (diffInDays === 0) return "aujourd'hui";
                        if (diffInDays === 1) return "il y a 1 jour";
                        return `il y a ${diffInDays} jours`;
                      };

                      // Couleur de la barre selon la priorité
                      const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                         t.priority === "haute" ? "#F59E0B" : 
                                         t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                         "#0DADDB";

                      return (
                        <div
                          key={t.id} 
                          onClick={() => loadTicketDetails(t.id)}
                          style={{
                            position: "relative",
                            background: "white",
                            borderRadius: "12px",
                            padding: "16px",
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            overflow: "visible",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
                          }}
                        >
                          {/* Barre de priorité à gauche */}
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: "4px",
                              background: borderColor,
                              borderTopLeftRadius: "12px",
                              borderBottomLeftRadius: "12px",
                            }}
                          />

                          {/* En-tête : ID + Badges + Menu 3 points */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "14px", color: "#1f2937", fontFamily: "monospace", fontWeight: "600" }}>
                                {formatTicketNumber(t.number)}
                              </span>
                              
                              {/* Badge Statut */}
                              <span style={{
                                padding: "2px 10px",
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

                              {/* Badge Priorité */}
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                                color: t.priority === "critique" ? "#E53E3E" : t.priority === "haute" ? "#F59E0B" : t.priority === "moyenne" ? "#0DADDB" : t.priority === "faible" ? "#6B7280" : "#374151",
                                whiteSpace: "nowrap",
                              }}>
                                {getPriorityLabel(t.priority)}
                              </span>

                              {/* Badge Catégorie */}
                              {(() => {
                                // Déterminer le type de ticket basé sur la catégorie ou le type
                                const category = t.category || "";
                                const ticketType = t.type || "";
                                const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                                    category.toLowerCase().includes("applicatif") ||
                                                    category.toLowerCase().includes("application") ||
                                                    ticketType === "applicatif";
                                const categoryType = isApplicatif ? "Applicatif" : "Matériel";
                                const CategoryIcon = isApplicatif ? Monitor : Wrench;
                                
                                return (
                                  <span style={{
                                    padding: "3px 8px",
                                    borderRadius: "20px",
                                    fontSize: "10px",
                                    fontWeight: "500",
                                    background: "#f3f4f6",
                                    color: "#1f2937",
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}>
                                    <CategoryIcon size={12} style={{ flexShrink: 0, color: "#1f2937" }} />
                                    <span>{categoryType}</span>
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Menu 3 points */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setOpenActionsMenuFor(openActionsMenuFor === t.id ? null : t.id);
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
                                  borderRadius: "4px",
                                    cursor: "pointer",
                                    color: "#475569",
                                    backgroundImage:
                                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "center",
                                  backgroundSize: "18px 18px",
                                  transition: "background-color 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              />
                              {openActionsMenuFor === t.id && (
                                  <div
                                    style={{
                                    position: "absolute",
                                    top: "100%",
                                    right: 0,
                                    marginTop: "4px",
                                      background: "white",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                      minWidth: 220,
                                    zIndex: 1000,
                                    overflow: "visible"
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  ref={(el) => {
                                    if (el) {
                                      const button = el.previousElementSibling as HTMLElement;
                                      if (button) {
                                        const rect = button.getBoundingClientRect();
                                        const viewportHeight = window.innerHeight;
                                        const menuHeight = 180;
                                        const spaceBelow = viewportHeight - rect.bottom;
                                        const spaceAbove = rect.top;
                                        
                                        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
                                          el.style.bottom = "100%";
                                          el.style.top = "auto";
                                          el.style.marginBottom = "4px";
                                          el.style.marginTop = "0";
                                        } else {
                                          el.style.top = "100%";
                                          el.style.bottom = "auto";
                                          el.style.marginTop = "4px";
                                          el.style.marginBottom = "0";
                                        }
                                      }
                                    }
                                  }}
                                  >
                                    <button
                                      onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                        border: "none",
                                        textAlign: "left",
                                      cursor: "pointer",
                                        color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Voir le ticket
                                    </button>
                                    <button
                                      onClick={() => { setSelectedTicket(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                        border: "none",
                                      borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                      cursor: "pointer",
                                        color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Ajouter commentaire
                                    </button>
                                    <button
                                      onClick={() => { setRequestInfoTicket(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                        border: "none",
                                      borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                      cursor: "pointer",
                                        color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Demander info
                                    </button>
                                    <button
                                      onClick={() => { handleMarkResolved(t.id); setOpenActionsMenuFor(null); }}
                                      disabled={loading}
                                      style={{
                                        width: "100%",
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                        border: "none",
                                      borderTop: "1px solid #e5e7eb",
                                        textAlign: "left",
                                      cursor: "pointer",
                                        color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Marquer résolu
                                    </button>
                                  </div>
                                )}
                              </div>
                          </div>

                          {/* Titre du ticket */}
                          <h4 style={{
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#1f2937",
                            marginBottom: "6px",
                            lineHeight: "1.3",
                          }}>
                            {t.title}
                          </h4>

                          {/* Description du ticket */}
                          <p style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            marginBottom: "12px",
                            lineHeight: "1.4",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {t.description || "Aucune description"}
                          </p>

                          {/* Pied de carte : Créateur, Date */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {/* Avatar + Nom créateur */}
                              {t.creator && (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <div style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background: "#e5e7eb",
                                    display: "flex",
                                alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    color: "#374151",
                                  }}>
                                    {getInitials(t.creator.full_name || "Inconnu")}
                                  </div>
                                  <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                    {t.creator.full_name || "Inconnu"}
                              </span>
                                </div>
                              )}

                              {/* Date relative */}
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <Clock size={12} color="#9ca3af" />
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                  {getRelativeTime(t.assigned_at || t.created_at || null)}
                              </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {activeSection === "tickets-resolus" && (
              <div style={{ marginTop: "24px" }}>
                {/* Tickets Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    overflow: "visible",
                  }}
                >
                  {resolvedTickets.length === 0 ? (
                <div style={{ 
                      textAlign: "center", 
                      padding: "40px", 
                      color: "#999", 
                      fontWeight: "500",
                  background: "white", 
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}>
                            Aucun ticket résolu
                    </div>
                  ) : (
                    resolvedTickets.map((t) => {
                      // Fonction helper pour calculer la date relative
                      const getRelativeTime = (date: string | null) => {
                        if (!date) return "N/A";
                        const now = new Date();
                        const past = new Date(date);
                        const diffInMs = now.getTime() - past.getTime();
                        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                        
                        if (diffInDays === 0) return "aujourd'hui";
                        if (diffInDays === 1) return "il y a 1 jour";
                        return `il y a ${diffInDays} jours`;
                      };

                      // Couleur de la barre selon la priorité
                      const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                         t.priority === "haute" ? "#F59E0B" : 
                                         t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                         "#0DADDB";

                      // Déterminer le statut pour l'affichage
                      const isResolved = t.status === "resolu";
                      const statusLabel = isResolved ? "Résolu" : "Clôturé";
                      const statusBg = isResolved ? "rgba(47, 158, 68, 0.1)" : "#e5e7eb";
                      const statusColor = isResolved ? "#2F9E44" : "#374151";

                      return (
                        <div
                          key={t.id} 
                          onClick={() => loadTicketDetails(t.id)}
                          style={{
                            position: "relative",
                            background: "white",
                            borderRadius: "12px",
                            padding: "16px",
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            overflow: "visible",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
                          }}
                        >
                          {/* Barre de priorité à gauche */}
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: "4px",
                              background: borderColor,
                              borderTopLeftRadius: "12px",
                              borderBottomLeftRadius: "12px",
                            }}
                          />

                          {/* En-tête : ID + Badges + Menu 3 points */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "14px", color: "#1f2937", fontFamily: "monospace", fontWeight: "600" }}>
                                {formatTicketNumber(t.number)}
                              </span>
                              
                              {/* Badge Statut */}
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "500",
                                background: statusBg,
                                color: statusColor,
                                whiteSpace: "nowrap",
                              }}>
                                {statusLabel}
                              </span>

                              {/* Badge Priorité */}
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                                color: t.priority === "critique" ? "#E53E3E" : t.priority === "haute" ? "#F59E0B" : t.priority === "moyenne" ? "#0DADDB" : t.priority === "faible" ? "#6B7280" : "#374151",
                                whiteSpace: "nowrap",
                              }}>
                                {getPriorityLabel(t.priority)}
                              </span>

                              {/* Badge Catégorie */}
                              {(() => {
                                // Déterminer le type de ticket basé sur la catégorie ou le type
                                const category = t.category || "";
                                const ticketType = t.type || "";
                                const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                                    category.toLowerCase().includes("applicatif") ||
                                                    category.toLowerCase().includes("application") ||
                                                    ticketType === "applicatif";
                                const categoryType = isApplicatif ? "Applicatif" : "Matériel";
                                const CategoryIcon = isApplicatif ? Monitor : Wrench;
                                
                                return (
                              <span style={{
                                    padding: "3px 8px",
                                    borderRadius: "20px",
                                    fontSize: "10px",
                                    fontWeight: "500",
                                    background: "#f3f4f6",
                                    color: "#1f2937",
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}>
                                    <CategoryIcon size={12} style={{ flexShrink: 0, color: "#1f2937" }} />
                                    <span>{categoryType}</span>
                              </span>
                                );
                              })()}
                            </div>

                            {/* Menu 3 points */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setOpenActionsMenuFor(openActionsMenuFor === t.id ? null : t.id);
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
                                  borderRadius: "4px", 
                                  cursor: "pointer",
                                  color: "#475569",
                                  backgroundImage:
                                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                  backgroundSize: "18px 18px",
                                  transition: "background-color 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              />
                              {openActionsMenuFor === t.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    right: 0,
                                    marginTop: "4px",
                                    background: "white",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 8,
                                    boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                    minWidth: 160,
                                    zIndex: 1000,
                                    overflow: "visible"
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  ref={(el) => {
                                    if (el) {
                                      const button = el.previousElementSibling as HTMLElement;
                                      if (button) {
                                        const rect = button.getBoundingClientRect();
                                        const viewportHeight = window.innerHeight;
                                        const menuHeight = 60;
                                        const spaceBelow = viewportHeight - rect.bottom;
                                        const spaceAbove = rect.top;
                                        
                                        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
                                          el.style.bottom = "100%";
                                          el.style.top = "auto";
                                          el.style.marginBottom = "4px";
                                          el.style.marginTop = "0";
                                        } else {
                                          el.style.top = "100%";
                                          el.style.bottom = "auto";
                                          el.style.marginTop = "4px";
                                          el.style.marginBottom = "0";
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <button
                                    onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                    disabled={loading}
                                    style={{ 
                                      width: "100%", 
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                      border: "none", 
                                      textAlign: "left", 
                                      cursor: "pointer",
                                      color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    Voir le ticket
                              </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Titre du ticket */}
                          <h4 style={{
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#1f2937",
                            marginBottom: "6px",
                            lineHeight: "1.3",
                          }}>
                            {t.title}
                          </h4>

                          {/* Description du ticket */}
                          <p style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            marginBottom: "12px",
                            lineHeight: "1.4",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {t.description || "Aucune description"}
                          </p>

                          {/* Pied de carte : Créateur, Date */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {/* Avatar + Nom créateur */}
                              {t.creator && (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <div style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background: "#e5e7eb",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    color: "#374151",
                                  }}>
                                    {getInitials(t.creator.full_name || "Inconnu")}
                                  </div>
                                  <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                    {t.creator.full_name || "Inconnu"}
                                  </span>
                                </div>
                              )}

                              {/* Date relative */}
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <Clock size={12} color="#9ca3af" />
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                  {getRelativeTime(t.assigned_at || t.created_at || null)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {activeSection === "tickets-rejetes" && (
              <div style={{ marginTop: "24px" }}>
                {/* Tickets Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    overflow: "visible",
                  }}
                >
                  {rejectedTickets.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: "40px", 
                      color: "#999", 
                      fontWeight: "500",
                      background: "white",
                      borderRadius: "12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}>
                      Aucun ticket rejeté
                    </div>
                  ) : (
                    rejectedTickets.map((t) => {
                      // Fonction helper pour calculer la date relative
                      const getRelativeTime = (date: string | null) => {
                        if (!date) return "N/A";
                        const now = new Date();
                        const past = new Date(date);
                        const diffInMs = now.getTime() - past.getTime();
                        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                        
                        if (diffInDays === 0) return "aujourd'hui";
                        if (diffInDays === 1) return "il y a 1 jour";
                        return `il y a ${diffInDays} jours`;
                      };

                      // Couleur de la barre selon la priorité
                      const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                         t.priority === "haute" ? "#F59E0B" : 
                                         t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                         "#0DADDB";

                      return (
                        <div
                          key={t.id} 
                          onClick={() => loadTicketDetails(t.id)}
                          style={{
                            position: "relative",
                            background: "white",
                            borderRadius: "12px",
                            padding: "16px",
                            border: "1px solid #e5e7eb",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            overflow: "visible",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
                          }}
                        >
                          {/* Barre de priorité à gauche */}
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: "4px",
                              background: borderColor,
                              borderTopLeftRadius: "12px",
                              borderBottomLeftRadius: "12px",
                            }}
                          />

                          {/* En-tête : ID + Badges + Menu 3 points */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "14px", color: "#1f2937", fontFamily: "monospace", fontWeight: "600" }}>
                                {formatTicketNumber(t.number)}
                              </span>
                              
                              {/* Badge Statut */}
                              <span style={{
                                padding: "6px 12px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: "#fee2e2",
                                color: "#991b1b",
                                whiteSpace: "nowrap",
                              }}>
                                Rejeté
                              </span>

                              {/* Badge Priorité */}
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "500",
                                background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                                color: t.priority === "critique" ? "#E53E3E" : t.priority === "haute" ? "#F59E0B" : t.priority === "moyenne" ? "#0DADDB" : t.priority === "faible" ? "#6B7280" : "#374151",
                                whiteSpace: "nowrap",
                              }}>
                                {getPriorityLabel(t.priority)}
                              </span>

                              {/* Badge Catégorie */}
                              {(() => {
                                // Déterminer le type de ticket basé sur la catégorie ou le type
                                const category = t.category || "";
                                const ticketType = t.type || "";
                                const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                                    category.toLowerCase().includes("applicatif") ||
                                                    category.toLowerCase().includes("application") ||
                                                    ticketType === "applicatif";
                                const categoryType = isApplicatif ? "Applicatif" : "Matériel";
                                const CategoryIcon = isApplicatif ? Monitor : Wrench;
                                
                                return (
                                  <span style={{
                                    padding: "3px 8px",
                                    borderRadius: "20px",
                                    fontSize: "10px",
                                    fontWeight: "500",
                                    background: "#f3f4f6",
                                    color: "#1f2937",
                                    whiteSpace: "nowrap",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}>
                                    <CategoryIcon size={12} style={{ flexShrink: 0, color: "#1f2937" }} />
                                    <span>{categoryType}</span>
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Menu 3 points */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setOpenActionsMenuFor(openActionsMenuFor === t.id ? null : t.id);
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
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  color: "#475569",
                                  backgroundImage:
                                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='5' r='2' fill='%23475569'/><circle cx='12' cy='12' r='2' fill='%23475569'/><circle cx='12' cy='19' r='2' fill='%23475569'/></svg>\")",
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "center",
                                  backgroundSize: "18px 18px",
                                  transition: "background-color 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                              />
                              {openActionsMenuFor === t.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    right: 0,
                                    marginTop: "4px",
                                    background: "white",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 8,
                                    boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                                    minWidth: 160,
                                    zIndex: 1000,
                                    overflow: "visible"
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  ref={(el) => {
                                    if (el) {
                                      const button = el.previousElementSibling as HTMLElement;
                                      if (button) {
                                        const rect = button.getBoundingClientRect();
                                        const viewportHeight = window.innerHeight;
                                        const menuHeight = 120;
                                        const spaceBelow = viewportHeight - rect.bottom;
                                        const spaceAbove = rect.top;
                                        
                                        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
                                          el.style.bottom = "100%";
                                          el.style.top = "auto";
                                          el.style.marginBottom = "4px";
                                          el.style.marginTop = "0";
                                        } else {
                                          el.style.top = "100%";
                                          el.style.bottom = "auto";
                                          el.style.marginTop = "4px";
                                          el.style.marginBottom = "0";
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <button
                                    onClick={() => { loadTicketDetails(t.id); setOpenActionsMenuFor(null); }}
                                    disabled={loading}
                                    style={{ 
                                      width: "100%", 
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                      border: "none", 
                                      textAlign: "left", 
                                      cursor: "pointer",
                                      color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    Voir le ticket
                                  </button>
                                  <button
                                    onClick={() => { handleTakeCharge(t.id); setOpenActionsMenuFor(null); }}
                                    disabled={loading}
                                    style={{ 
                                      width: "100%", 
                                      padding: "10px 12px", 
                                      background: "transparent", 
                                      border: "none", 
                                      borderTop: "1px solid #e5e7eb",
                                      textAlign: "left", 
                                      cursor: "pointer",
                                      color: "#111827",
                                      fontSize: "14px",
                                      display: "block",
                                      whiteSpace: "nowrap"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    Reprendre
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Titre du ticket */}
                          <h4 style={{
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#1f2937",
                            marginBottom: "6px",
                            lineHeight: "1.3",
                          }}>
                            {t.title}
                          </h4>

                          {/* Description du ticket */}
                          <p style={{
                            fontSize: "13px",
                            color: "#6b7280",
                            marginBottom: "12px",
                            lineHeight: "1.4",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {t.description || "Aucune description"}
                          </p>

                          {/* Pied de carte : Créateur, Date */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {/* Avatar + Nom créateur */}
                              {t.creator && (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <div style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "50%",
                                    background: "#e5e7eb",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                    color: "#374151",
                                  }}>
                                    {getInitials(t.creator.full_name || "Inconnu")}
                                  </div>
                                  <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                    {t.creator.full_name || "Inconnu"}
                                  </span>
                                </div>
                              )}

                              {/* Date relative */}
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <Clock size={12} color="#9ca3af" />
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                  {getRelativeTime(t.assigned_at || t.created_at || null)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
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
                              background: selectedNotificationTicketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                              color: selectedNotificationTicketDetails.priority === "critique" ? "#E53E3E" : selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : selectedNotificationTicketDetails.priority === "moyenne" ? "#0DADDB" : "white"
                            }}>
                              {getPriorityLabel(selectedNotificationTicketDetails.priority)}
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
                  background: ticketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : ticketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : ticketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                  color: ticketDetails.priority === "critique" ? "#E53E3E" : ticketDetails.priority === "haute" ? "#F59E0B" : ticketDetails.priority === "moyenne" ? "#0DADDB" : "white"
                }}>
                  {getPriorityLabel(ticketDetails.priority)}
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
                          background: selectedNotificationTicketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "#dbeafe" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "critique" ? "#E53E3E" : selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : selectedNotificationTicketDetails.priority === "moyenne" ? "#1e40af" : "white"
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
