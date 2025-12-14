import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { PanelLeft } from "lucide-react";

interface UserDashboardProps {
  token: string;
}

interface Ticket {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  feedback_score?: number | null;
  technician?: {
    full_name: string;
    profile_photo_url?: string | null;
  } | null;
  creator?: {
    full_name: string;
    email: string;
  } | null;
  created_at: string;
  assigned_at?: string | null;
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

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  ticket_id?: string | null;
}

function UserDashboard({ token: tokenProp }: UserDashboardProps) {
  // Récupérer le token depuis localStorage si le prop est vide
  const [actualToken, setActualToken] = useState<string>(() => {
    if (tokenProp && tokenProp.trim() !== "") {
      return tokenProp;
    }
    const storedToken = localStorage.getItem("token");
    return storedToken || "";
  });
  
  // NOTE: Ces catégories sont des exemples. Elles peuvent être facilement remplacées 
  // par de vraies données provenant d'une API ou d'une base de données.
  // Pour modifier ces catégories, remplacez simplement les tableaux ci-dessous.
  const CATEGORIES_MATERIEL = [
    "Ordinateur portable",
    "Ordinateur de bureau",
    "Imprimante",
    "Scanner",
    "Écran/Moniteur",
    "Clavier/Souris",
    "Réseau (Switch, Routeur)",
    "Serveur",
    "Téléphone/IP Phone",
    "Autre matériel"
  ];
  
  const CATEGORIES_APPLICATIF = [
    "Système d'exploitation",
    "Logiciel bureautique",
    "Application métier",
    "Email/Messagerie",
    "Navigateur web",
    "Base de données",
    "Sécurité/Antivirus",
    "Application web",
    "API/Service",
    "Autre applicatif"
  ];
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("moyenne");
  const [type, setType] = useState("materiel");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationTicket, setValidationTicket] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [showRejectionForm, setShowRejectionForm] = useState<boolean>(false);
  const [feedbackTicket, setFeedbackTicket] = useState<string | null>(null);
  const [feedbackScore, setFeedbackScore] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState<string>("");
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("moyenne");
  const [editType, setEditType] = useState<string>("materiel");
  const [editCategory, setEditCategory] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [viewTicketDetails, setViewTicketDetails] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [resumedFlags, setResumedFlags] = useState<Record<string, boolean>>({});
  const [confirmDeleteTicket, setConfirmDeleteTicket] = useState<Ticket | null>(null);
  
  // Mettre à jour le token si le prop change
  useEffect(() => {
    if (tokenProp && tokenProp.trim() !== "") {
      setActualToken(tokenProp);
    } else {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setActualToken(storedToken);
      } else {
        console.error("Aucun token trouvé - redirection vers la page de connexion");
        window.location.href = "/";
      }
    }
  }, [tokenProp]);

  async function loadTickets() {
    if (!actualToken || actualToken.trim() === "") {
      console.warn("Pas de token pour charger les tickets");
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/tickets/me", {
        headers: {
          Authorization: `Bearer ${actualToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Tickets chargés:", data);
        setTickets(data);
      } else if (res.status === 401) {
        // Token invalide, rediriger vers la page de connexion
        localStorage.removeItem("token");
        localStorage.removeItem("userRole");
        window.location.href = "/";
      } else {
        console.error("Erreur lors du chargement des tickets:", res.status, res.statusText);
      }
    } catch (err) {
      console.error("Erreur lors du chargement des tickets:", err);
    }
  }

  async function loadNotifications() {
    if (!actualToken || actualToken.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/notifications/", {
        headers: {
          Authorization: `Bearer ${actualToken}`,
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

  // Détecter les tickets "repris" après un rejet pour afficher un badge informatif
  useEffect(() => {
    const enCours = tickets.filter((t) => t.status === "en_cours");
    const toCheck = enCours.filter((t) => !(String(t.id) in resumedFlags));
    if (toCheck.length === 0 || !actualToken || actualToken.trim() === "") return;

    toCheck.forEach(async (t) => {
      try {
        const res = await fetch(`http://localhost:8000/tickets/${t.id}/history`, {
          headers: { Authorization: `Bearer ${actualToken}` },
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
  }, [tickets, actualToken, resumedFlags]);

  async function loadUnreadCount() {
    if (!actualToken || actualToken.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/notifications/unread/count", {
        headers: {
          Authorization: `Bearer ${actualToken}`,
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

  function openEditModal(ticket: Ticket) {
    if (ticket.status === "assigne_technicien" || ticket.status === "en_cours") {
      alert("Le ticket est déjà en cours de traitement");
      return;
    }
    setEditTicketId(ticket.id);
    setEditTitle(ticket.title);
    setEditDescription(ticket.description || "");
    setEditPriority(ticket.priority);
    setEditType((ticket as any).type || "materiel");
    setEditCategory((ticket as any).category || "");
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!actualToken || !editTicketId) return;
    try {
      const res = await fetch(`http://localhost:8000/tickets/${editTicketId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${actualToken}`,
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          priority: editPriority,
          type: editType,
          category: editCategory || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
        setShowEditModal(false);
        setEditTicketId(null);
      } else if (res.status === 403) {
        const errText = await res.text();
        alert(errText || "Le ticket est déjà en cours de traitement");
      }
    } catch (err) {
      console.error("Erreur lors de la modification du ticket:", err);
    }
  }

  async function handleDelete(ticket: Ticket) {
    if (ticket.status === "assigne_technicien" || ticket.status === "en_cours") {
      alert("Le ticket est déjà en cours de traitement");
      return;
    }
    if (!actualToken) return;
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${actualToken}`,
        },
      });
      if (res.ok || res.status === 204) {
        setTickets(prev => prev.filter(t => t.id !== ticket.id));
      } else if (res.status === 403) {
        const errText = await res.text();
        alert(errText || "Le ticket est déjà en cours de traitement");
      }
    } catch (err) {
      console.error("Erreur lors de la suppression du ticket:", err);
    }
  }

  async function markNotificationAsRead(notificationId: string) {
    if (!actualToken || actualToken.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:8000/notifications/${notificationId}/read`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${actualToken}`,
        },
      });
      if (res.ok) {
        // Recharger les notifications et le compteur
        await loadNotifications();
        await loadUnreadCount();
      }
    } catch (err) {
      console.error("Erreur lors du marquage de la notification comme lue:", err);
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("userRole");
    } catch (e) {
      console.error("Erreur lors de la suppression des informations de session:", e);
    }
    setActualToken("");
    window.location.href = "/";
  }

  async function loadTicketDetails(ticketId: string) {
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}`, {
        headers: {
          Authorization: `Bearer ${actualToken}`,
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
      alert("Erreur lors du chargement des détails");
    }
  }

  async function loadTicketHistory(ticketId: string) {
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/history`, {
        headers: {
          Authorization: `Bearer ${actualToken}`,
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

  useEffect(() => {
    if (actualToken) {
      void loadTickets();
      void loadNotifications();
      void loadUnreadCount();
      // Charger les informations de l'utilisateur
      async function loadUserInfo() {
        try {
          const res = await fetch("http://localhost:8000/auth/me", {
            headers: {
              Authorization: `Bearer ${actualToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            setUserInfo({ full_name: data.full_name });
          }
        } catch (err) {
          console.error("Erreur lors du chargement des infos utilisateur:", err);
        }
      }
      void loadUserInfo();
      
      // Recharger les notifications toutes les 30 secondes
      const interval = setInterval(() => {
        void loadNotifications();
        void loadUnreadCount();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [actualToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    // Vérifier que le token existe
    if (!actualToken || actualToken.trim() === "") {
      setError("Erreur d'authentification : veuillez vous reconnecter");
      setLoading(false);
      return;
    }
    
    try {
      const requestBody = {
        title: title.trim(),
        description: description.trim(),
        priority: priority.toLowerCase(),
        type: type.toLowerCase(),
        category: category.trim() || undefined,
      };
      
      console.log("Envoi de la requête de création de ticket...", requestBody);
      console.log("Token utilisé:", actualToken.substring(0, 20) + "...");
      
      const res = await fetch("http://localhost:8000/tickets/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${actualToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log("Réponse reçue:", res.status, res.statusText);
      
      if (!res.ok) {
        let errorMessage = `Erreur ${res.status}: ${res.statusText}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorMessage;
          console.error("Détails de l'erreur:", errorData);
        } catch {
          // Si on ne peut pas parser le JSON, utiliser le message par défaut
          const textError = await res.text();
          console.error("Erreur (texte):", textError);
        }
        throw new Error(errorMessage);
      }
      
      // Succès
      const newTicket = await res.json();
      console.log("Ticket créé avec succès:", newTicket);
      setTitle("");
      setDescription("");
      setPriority("moyenne");
      setType("materiel");
      setCategory("");
      setShowCreateModal(false);
      // S'assurer que la section est sur dashboard pour voir les tickets
      setActiveSection("dashboard");
      void loadTickets();
      void loadNotifications();
      void loadUnreadCount();
      alert("Ticket créé avec succès !");
    } catch (err: any) {
      const errorMsg = err.message || "Erreur lors de la création du ticket";
      setError(errorMsg);
      console.error("Erreur création ticket:", err);
      
      // Message plus spécifique pour "Failed to fetch"
      if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
        setError("Impossible de contacter le serveur. Vérifiez que le backend est démarré sur http://localhost:8000");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateTicket(ticketId: string, validated: boolean) {
    // Si rejet, vérifier que le motif est fourni
    if (!validated && (!rejectionReason || !rejectionReason.trim())) {
      alert("Veuillez indiquer un motif de rejet");
      return;
    }

    setLoading(true);
    try {
      const requestBody: { validated: boolean; rejection_reason?: string } = { validated };
      if (!validated && rejectionReason) {
        requestBody.rejection_reason = rejectionReason.trim();
      }

      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/validate`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${actualToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        await loadTickets();
        await loadNotifications();
        await loadUnreadCount();
        setValidationTicket(null);
        setRejectionReason("");
        setShowRejectionForm(false);
        alert(validated ? "Ticket validé et clôturé avec succès !" : "Ticket rejeté. Le technicien a été notifié avec le motif.");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de valider le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur validation:", err);
      alert("Erreur lors de la validation");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitFeedback(ticketId: string) {
    if (feedbackScore < 1 || feedbackScore > 5) {
      alert("Veuillez sélectionner un score entre 1 et 5");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/feedback`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${actualToken}`,
        },
        body: JSON.stringify({
          score: feedbackScore,
          comment: feedbackComment,
        }),
      });

      if (res.ok) {
        await loadTickets();
        await loadNotifications();
        await loadUnreadCount();
        setFeedbackTicket(null);
        setFeedbackScore(5);
        setFeedbackComment("");
        alert("Merci pour votre avis !");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible d'envoyer le feedback"}`);
      }
    } catch (err) {
      console.error("Erreur feedback:", err);
      alert("Erreur lors de l'envoi du feedback");
    } finally {
      setLoading(false);
    }
  }

  // Compteurs pour chaque statut
  const statusCounts = {
    en_attente_analyse: tickets.filter((t) => t.status === "en_attente_analyse").length,
    assigne_technicien: tickets.filter((t) => t.status === "assigne_technicien").length,
    en_cours: tickets.filter((t) => t.status === "en_cours").length,
    resolu: tickets.filter((t) => t.status === "resolu").length,
    rejete: tickets.filter((t) => t.status === "rejete").length,
    cloture: tickets.filter((t) => t.status === "cloture").length,
  };

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Aujourd'hui";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Hier";
    } else {
      return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const ticketsListRef = useRef<HTMLDivElement>(null);
  const [userInfo, setUserInfo] = useState<{ full_name: string } | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [selectedCharacteristic, setSelectedCharacteristic] = useState<string>("");
  const [selectedFilterValue, setSelectedFilterValue] = useState<string>("");


  // Fonction pour naviguer vers une section de statut
  function handleStatusClick(status: string) {
    setSelectedStatus(status);
    setActiveSection("tickets-by-status");
    setSearchFilter("");
    setSelectedCharacteristic("");
    setSelectedFilterValue("");
    // Scroll vers le haut pour voir la section de filtrage
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  // Fonction pour obtenir les valeurs uniques selon la caractéristique, en respectant les filtres déjà appliqués
  function getUniqueValues(characteristic: string, currentStatus?: string | null, currentFilterValue?: string, currentChar?: string): string[] {
    const values = new Set<string>();
    
    // Utiliser les paramètres passés ou les états actuels
    const statusToUse = currentStatus !== undefined ? currentStatus : selectedStatus;
    const filterValueToUse = currentFilterValue !== undefined ? currentFilterValue : selectedFilterValue;
    const charToUse = currentChar !== undefined ? currentChar : selectedCharacteristic;
    
    // D'abord, filtrer les tickets selon les filtres déjà appliqués
    let filteredTickets = tickets;
    
    // Si on est arrivé depuis le dashboard avec un statut sélectionné, on filtre toujours par ce statut
    // même si on change de caractéristique
    if (statusToUse) {
      filteredTickets = filteredTickets.filter(t => t.status === statusToUse);
    }
    
    // Si un filtre est déjà sélectionné pour une autre caractéristique, on l'applique
    if (filterValueToUse && charToUse !== characteristic && charToUse !== "statut") {
      // Appliquer le filtre d'une autre caractéristique
      filteredTickets = filteredTickets.filter((t) => {
        switch (charToUse) {
          case "id":
            return t.number.toString() === filterValueToUse;
          case "titre":
            return t.title.toLowerCase().includes(filterValueToUse.toLowerCase());
          case "description":
            return t.description?.toLowerCase().includes(filterValueToUse.toLowerCase()) || false;
          case "statut":
            return t.status === filterValueToUse;
          case "priorite":
            return t.priority === filterValueToUse;
          case "demandeur":
            return t.creator?.full_name === filterValueToUse;
          case "technicien":
            return t.technician?.full_name === filterValueToUse;
          default:
            return true;
        }
      });
    }
    
    // Maintenant, extraire les valeurs uniques de la caractéristique demandée depuis les tickets filtrés
    filteredTickets.forEach((ticket) => {
      switch (characteristic) {
        case "id":
          values.add(ticket.number.toString());
          break;
        case "description":
          if (ticket.description) {
            values.add(ticket.description);
          }
          break;
        case "statut":
          values.add(ticket.status);
          break;
        case "priorite":
          values.add(ticket.priority);
          break;
        case "titre":
          values.add(ticket.title);
          break;
        case "demandeur":
          if (ticket.creator?.full_name) {
            values.add(ticket.creator.full_name);
          }
          break;
        case "technicien":
          if (ticket.technician?.full_name) {
            values.add(ticket.technician.full_name);
          }
          break;
      }
    });
    return Array.from(values).sort();
  }

  // Fonction pour obtenir le libellé d'un statut
  function getStatusLabel(status: string): string {
    switch (status) {
      case "en_attente_analyse": return "En attente d'analyse";
      case "assigne_technicien": return "Assigné au technicien";
      case "en_cours": return "En cours";
      case "resolu": return "Résolu";
      case "rejete": return "Rejeté";
      case "cloture": return "Clôturé";
      default: return status;
    }
  }

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif", background: "#f5f5f5" }}>
      {/* Sidebar */}
      <div style={{ 
        width: sidebarCollapsed ? "80px" : "250px", 
        background: "#1e293b", 
        color: "white", 
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        transition: "width 0.3s ease"
      }}>
        {/* Gestion d'Incidents Section */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: "20px", 
          paddingBottom: "20px", 
          borderBottom: "1px solid rgba(255,255,255,0.1)" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            {/* Logo 3D cube */}
            <div style={{
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#60a5fa"
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div style={{ fontSize: "16px", fontWeight: "600", color: "white", whiteSpace: "nowrap", flex: 1 }}>
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
                marginLeft: "16px",
                transition: "background 0.2s ease"
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
                transition: "background 0.2s ease"
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
            cursor: "pointer",
            background: activeSection === "dashboard" ? "rgba(59, 130, 246, 0.2)" : "transparent",
            borderRadius: "8px"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" fill="none" />
              <path d="M12 6v6l4 2" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1" fill="white" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>Tableau de bord</div>
        </div>
        <div 
          onClick={() => setShowCreateModal(true)}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            cursor: "pointer"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>Nouveau ticket</div>
        </div>
        <div 
          onClick={() => {
            setActiveSection("tickets");
            setTimeout(() => {
              ticketsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            cursor: "pointer"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 7h8M8 11h8M8 15h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>Mes tickets</div>
        </div>
        <div 
          onClick={() => {}}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            cursor: "pointer"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 9h.01M13 9h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1" fill="white" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>FAQ & Aide</div>
        </div>
        <div 
          onClick={handleLogout}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            cursor: "pointer"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 17 21 12 16 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>Déconnexion</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre de navigation en haut */}
        <div style={{
          background: "#1e293b",
          padding: "16px 30px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(59, 130, 246, 0.2)"
        }}>
          {/* Left side - Empty to maintain top bar size */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          </div>

          {/* Right side - Icons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
            {/* Plus Icon - Trudesk style */}
            <div
              onClick={() => setShowCreateModal(true)}
              style={{
                width: "40px",
                height: "40px",
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "white",
            cursor: "pointer", 
                borderRadius: "4px",
                transition: "background 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            
            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* Chat Icon - Simple speech bubble */}
            <div
              style={{
                width: "40px",
                height: "40px",
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "white",
                cursor: "pointer",
                borderRadius: "4px",
                transition: "background 0.2s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* Bell Icon with Notification - Trudesk style */}
          <div 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ 
                width: "40px",
                height: "40px",
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              color: "white",
                cursor: "pointer",
                borderRadius: "4px",
              position: "relative",
                transition: "background 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
              {/* Notification Badge - Trudesk style (top right) */}
            {unreadCount > 0 && (
              <span style={{
                position: "absolute",
                  top: "4px",
                  right: "4px",
                  minWidth: "16px",
                  height: "16px",
                background: "#ef4444",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                  fontSize: "10px",
                fontWeight: "bold",
                color: "white",
                  padding: "0 3px",
                  border: "2px solid #1e293b"
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* User Name and Avatar - Trudesk style */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "8px" }}>
              <div style={{ fontSize: "14px", color: "white" }}>
              {userInfo?.full_name || "Utilisateur"}
              </div>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {/* Online Status Indicator - Trudesk style (green circle with white border) */}
              <div style={{
                position: "absolute",
                bottom: "0",
                right: "0",
                  width: "10px",
                  height: "10px",
                background: "#10b981",
                borderRadius: "50%",
                  border: "2px solid white"
              }}></div>
            </div>
              </div>
          </div>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: "auto" }}>
          {/* Message de bienvenue - Visible seulement sur Dashboard */}
          {activeSection === "dashboard" && userInfo && (
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "28px", fontWeight: "600", color: "#333", margin: 0 }}>
                Bienvenue, {userInfo.full_name} 👋
              </h2>
            </div>
          )}
        
        {/* Section Tickets - Style GLPI - Visible seulement sur Dashboard */}
          {activeSection === "dashboard" && (
            <div style={{ 
              background: "transparent", 
              borderRadius: "0", 
              boxShadow: "none", 
              padding: "20px",
              marginBottom: "30px"
            }}>
            {/* Header retiré */}

            {/* Liste des statuts */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(3, 1fr)", 
              gap: "12px", 
              alignItems: "stretch" 
            }}>
              {/* (Carte 'En attente d'analyse' retirée) */}

              {/* En attente d'assignation */}
              <div 
                style={{ 
                  position: "relative",
                  display: "flex",
                  alignItems: "center", 
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  minHeight: "64px"
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "6px", background: "#fde68a", borderRadius: "12px 0 0 12px" }}></div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#fde68a" }}></div>
                  <span style={{ fontSize: "15px", color: "#374151" }}>En attente d'assignation</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>
                    {statusCounts.en_attente_analyse}
                  </span>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: "#fff7ed", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                      <path d="M3 7l3-4h12l3 4" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* En cours */}
              <div 
                style={{
                  position: "relative",
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  minHeight: "64px"
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "6px", background: "#fdba74", borderRadius: "12px 0 0 12px" }}></div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#fdba74" }}></div>
                  <span style={{ fontSize: "15px", color: "#374151" }}>En cours</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>{statusCounts.en_cours}</span>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: "#fff7ed", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Résolu */}
              <div 
                style={{ 
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  minHeight: "64px"
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "6px", background: "#a7f3d0", borderRadius: "12px 0 0 12px" }}></div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#a7f3d0" }}></div>
                  <span style={{ fontSize: "15px", color: "#374151" }}>Résolu</span>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>{statusCounts.resolu}</span>
                  <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: "#ecfdf5", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* (Cartes supplémentaires supprimées) */}
            </div>
            </div>
          )}
        
        {/* Interface de filtrage et tableau - Style GLPI */}
        {activeSection === "tickets-by-status" && selectedStatus && (
            <div style={{ 
              background: "white", 
              borderRadius: "8px", 
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)", 
            padding: "20px",
            marginBottom: "30px"
          }}>
            {/* Barre de filtres */}
            <div style={{ 
              background: "#f9fafb", 
              padding: "12px", 
              borderRadius: "6px", 
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "12px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                <select 
                  value={selectedCharacteristic || ""}
                  onChange={(e) => {
                    const newChar = e.target.value;
                    if (!newChar) return; // Ne pas permettre de désélectionner
                    
                    // Obtenir les valeurs uniques pour la nouvelle caractéristique en utilisant les valeurs actuelles
                    const uniqueValues = getUniqueValues(newChar, selectedStatus, selectedFilterValue, selectedCharacteristic);
                    
                    // Si il n'y a qu'une seule valeur, la sélectionner automatiquement
                    if (uniqueValues.length === 1) {
                      setSelectedFilterValue(uniqueValues[0]);
                    } else {
                      // Sinon, réinitialiser
                      setSelectedFilterValue("");
                    }
                    
                    // Mettre à jour la caractéristique
                    setSelectedCharacteristic(newChar);
                  }}
                  style={{ 
                    padding: "6px 12px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "4px",
                    fontSize: "14px",
                    background: "white",
                    cursor: "pointer",
                    color: selectedCharacteristic ? "#1e293b" : "#9ca3af"
                  }}
                >
                  <option value="" disabled>Caractéristiques</option>
                  <option value="id">ID</option>
                  <option value="titre">Titre</option>
                  <option value="description">Description</option>
                  <option value="statut">Statut</option>
                  <option value="priorite">Priorité</option>
                  <option value="demandeur">Demandeur</option>
                  <option value="technicien">Technicien</option>
                </select>
                <select 
                  style={{ 
                    padding: "6px 12px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "4px",
                    fontSize: "14px",
                    background: "white"
                  }}
                  value="est"
                  disabled
                >
                  <option value="est">est</option>
                </select>
                <select
                  value={selectedFilterValue}
                  onChange={(e) => setSelectedFilterValue(e.target.value)}
                  style={{ 
                    padding: "6px 12px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "4px",
                    fontSize: "14px",
              background: "white", 
                    cursor: "pointer",
                    minWidth: "200px"
                  }}
                >
                  <option value="">Sélectionner...</option>
                  {getUniqueValues(selectedCharacteristic).map((value) => (
                    <option key={value} value={value}>
                      {selectedCharacteristic === "statut" ? getStatusLabel(value) :
                       selectedCharacteristic === "priorite" ? getPriorityLabel(value) :
                       value.length > 50 ? value.substring(0, 50) + "..." : value}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    fontSize: "14px",
                    width: "200px"
                  }}
                />
                <button
                  onClick={() => setSearchFilter("")}
                  style={{
                    padding: "6px 12px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Effacer
                </button>
            </div>
            </div>

            {/* Barre d'actions */}
            <div style={{ 
              display: "flex",
              alignItems: "center", 
              justifyContent: "space-between",
              marginBottom: "16px",
              paddingBottom: "12px",
              borderBottom: "1px solid #e5e7eb"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={() => {
                    setSelectedStatus(null);
                    setActiveSection("dashboard");
                    setSearchFilter("");
                    setSelectedCharacteristic("statut");
                    setSelectedFilterValue("");
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#1e293b"
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Retour
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", color: "#6b7280" }}>
                  {tickets.filter((t) => {
                    // Filtre par statut initial (si on est arrivé depuis le dashboard)
                    let matchesStatus = true;
                    if (selectedStatus) {
                      matchesStatus = t.status === selectedStatus;
                    }
                    
                    // Filtre par caractéristique sélectionnée
                    let matchesFilter = true;
                    if (selectedFilterValue) {
                      switch (selectedCharacteristic) {
                        case "id":
                          matchesFilter = t.number.toString() === selectedFilterValue;
                          break;
                        case "titre":
                          matchesFilter = t.title.toLowerCase().includes(selectedFilterValue.toLowerCase());
                          break;
                        case "description":
                          matchesFilter = t.description?.toLowerCase().includes(selectedFilterValue.toLowerCase()) || false;
                          break;
                        case "statut":
                          matchesFilter = t.status === selectedFilterValue;
                          break;
                        case "priorite":
                          matchesFilter = t.priority === selectedFilterValue;
                          break;
                        case "demandeur":
                          matchesFilter = t.creator?.full_name === selectedFilterValue;
                          break;
                        case "technicien":
                          matchesFilter = t.technician?.full_name === selectedFilterValue;
                          break;
                      }
                    }
                    // Filtre par recherche
                    const matchesSearch = searchFilter === "" || 
                      t.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      t.number.toString().includes(searchFilter);
                    return matchesStatus && matchesFilter && matchesSearch;
                  }).length} ticket(s)
                </span>
              </div>
            </div>

            {/* Tableau des tickets */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>ID</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>TITRE</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>STATUT</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>PRIORITÉ</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>DATE D'OUVERTURE</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>DEMANDEUR</th>
                    <th style={{ padding: "12px", textAlign: "left", fontSize: "12px", fontWeight: "600", color: "#374151", textTransform: "uppercase" }}>TECHNICIEN</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets
                    .filter((t) => {
                      // Filtre par statut initial (si on est arrivé depuis le dashboard)
                      let matchesStatus = true;
                      if (selectedStatus) {
                        matchesStatus = t.status === selectedStatus;
                      }
                      
                      // Filtre par caractéristique sélectionnée
                      let matchesFilter = true;
                      if (selectedFilterValue) {
                        switch (selectedCharacteristic) {
                          case "id":
                            matchesFilter = t.number.toString() === selectedFilterValue;
                            break;
                          case "titre":
                            matchesFilter = t.title.toLowerCase().includes(selectedFilterValue.toLowerCase());
                            break;
                          case "description":
                            matchesFilter = t.description?.toLowerCase().includes(selectedFilterValue.toLowerCase()) || false;
                            break;
                          case "statut":
                            matchesFilter = t.status === selectedFilterValue;
                            break;
                          case "priorite":
                            matchesFilter = t.priority === selectedFilterValue;
                            break;
                          case "demandeur":
                            matchesFilter = t.creator?.full_name === selectedFilterValue;
                            break;
                          case "technicien":
                            matchesFilter = t.technician?.full_name === selectedFilterValue;
                            break;
                        }
                      }
                      // Filtre par recherche
                      const matchesSearch = searchFilter === "" || 
                        t.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
                        t.number.toString().includes(searchFilter);
                      return matchesStatus && matchesFilter && matchesSearch;
                    })
                    .map((t) => (
                      <tr 
                        key={t.id} 
                        style={{ 
                          borderBottom: "1px solid #e5e7eb",
                          cursor: "pointer"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f9fafb";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "white";
                        }}
                      >
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>#{t.number}</td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>{t.title}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: t.status === "en_attente_analyse" ? "#fef3c7" : t.status === "assigne_technicien" ? "#dbeafe" : t.status === "en_cours" ? "#fed7aa" : t.status === "resolu" ? "#d4edda" : t.status === "rejete" ? "#fee2e2" : "#e5e7eb",
                            color: t.status === "en_attente_analyse" ? "#92400e" : t.status === "assigne_technicien" ? "#1e40af" : t.status === "en_cours" ? "#9a3412" : t.status === "resolu" ? "#155724" : t.status === "rejete" ? "#991b1b" : "#374151",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}>
                            {t.status === "en_attente_analyse" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }}></div>}
                            {t.status === "assigne_technicien" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "2px solid #3b82f6" }}></div>}
                            {t.status === "en_cours" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f97316" }}></div>}
                            {t.status === "resolu" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "2px solid #6b7280" }}></div>}
                            {t.status === "rejete" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }}></div>}
                            {t.status === "cloture" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6b7280" }}></div>}
                            {t.status === "en_attente_analyse" ? "En attente d'analyse" :
                             t.status === "assigne_technicien" ? "Assigné au technicien" :
                             t.status === "en_cours" ? "En cours" :
                             t.status === "resolu" ? "Résolu" :
                             t.status === "rejete" ? "Rejeté" :
                             t.status === "cloture" ? "Clôturé" : t.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                            color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                          }}>
                            {t.priority}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>
                          {formatDate(t.created_at)}
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>
                          {t.creator?.full_name || "N/A"}
                        </td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>
                          {t.technician?.full_name || "-"}
                        </td>
                      </tr>
                    ))}
                  {tickets.filter((t) => {
                    // Filtre par caractéristique sélectionnée
                    let matchesFilter = true;
                    if (selectedFilterValue) {
                      switch (selectedCharacteristic) {
                        case "id":
                          matchesFilter = t.number.toString() === selectedFilterValue;
                          break;
                        case "titre":
                          matchesFilter = t.title.toLowerCase().includes(selectedFilterValue.toLowerCase());
                          break;
                        case "description":
                          matchesFilter = t.description?.toLowerCase().includes(selectedFilterValue.toLowerCase()) || false;
                          break;
                        case "statut":
                          matchesFilter = t.status === selectedFilterValue;
                          break;
                        case "priorite":
                          matchesFilter = t.priority === selectedFilterValue;
                          break;
                        case "demandeur":
                          matchesFilter = t.creator?.full_name === selectedFilterValue;
                          break;
                        case "technicien":
                          matchesFilter = t.technician?.full_name === selectedFilterValue;
                          break;
                      }
                    }
                    // Filtre par recherche
                    const matchesSearch = searchFilter === "" || 
                      t.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
                      t.number.toString().includes(searchFilter);
                    return matchesFilter && matchesSearch;
                  }).length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>
                        Aucun ticket trouvé
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section Header with Create Button */}
        {(activeSection === "tickets" || activeSection === "dashboard") && (
          <div ref={ticketsListRef}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: "#333" }}>
                {activeSection === "dashboard" ? "Mes Tickets Récents" : "Mes Tickets"}
              </h3>
            </div>
            {/* Tickets Table */}
            <div style={{ background: "white", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#9ca3af", borderBottom: "1px solid #6b7280" }}>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>ID</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>Titre</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>Statut</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>Priorité</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: "700", color: "#333", textTransform: "uppercase", letterSpacing: "0.5px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#999", fontWeight: "500" }}>
                    Aucun ticket créé
                  </td>
                </tr>
              ) : (
                [...tickets]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, activeSection === "dashboard" ? 5 : tickets.length)
                  .map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}>
                    <td style={{ padding: "16px", color: "#333", fontSize: "14px" }}>#{t.number}</td>
                    <td style={{ padding: "16px", color: "#333", fontSize: "14px" }}>{t.title}</td>
                    <td style={{ padding: "16px" }}>
                      <span style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "500",
                        background: t.status === "en_attente_analyse" ? "#fef3c7" : t.status === "assigne_technicien" ? "#dbeafe" : t.status === "en_cours" ? "#fed7aa" : t.status === "resolu" ? "#d4edda" : t.status === "rejete" ? "#fee2e2" : t.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                        color: t.status === "en_attente_analyse" ? "#92400e" : t.status === "assigne_technicien" ? "#1e40af" : t.status === "en_cours" ? "#9a3412" : t.status === "resolu" ? "#155724" : t.status === "rejete" ? "#991b1b" : t.status === "cloture" ? "#374151" : "#374151",
                        whiteSpace: "nowrap",
                        display: "inline-block"
                      }}>
                        {t.status === "en_attente_analyse" ? "En attente d'analyse" :
                         t.status === "assigne_technicien" ? "Assigné au technicien" :
                         t.status === "en_cours" ? "En cours" :
                         t.status === "resolu" ? "Résolu" :
                         t.status === "rejete" ? "Rejeté" :
                       t.status === "cloture" ? "Clôturé" : t.status}
                      </span>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "500",
                        background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fef3c7" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                        color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                      }}>
                        {t.priority}
                      </span>
                    </td>
                    <td style={{ padding: "16px", fontSize: "14px", color: "#333" }}>
                      {formatDate(t.assigned_at || t.created_at)}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); loadTicketDetails(t.id); }}
                          disabled={loading}
                          title="Voir détails"
                          aria-label="Voir détails"
                          style={{
                            width: 28,
                            height: 28,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "transparent",
                            border: "1px solid #475569",
                            borderRadius: 6,
                            cursor: "pointer",
                            color: "#475569",
                            backgroundImage:
                              'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\'><path d=\'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z\' stroke=\'%23475569\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/><circle cx=\'12\' cy=\'12\' r=\'3\' fill=\'none\' stroke=\'%23475569\' stroke-width=\'2\'/></svg>")',
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "18px 18px"
                          }}
                        >
                          {/* icon as background image */}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(t); }}
                          disabled={loading}
                          title="Modifier"
                          aria-label="Modifier"
                          style={{
                            width: 28,
                            height: 28,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "transparent",
                            border: "1px solid #1d4ed8",
                            borderRadius: 6,
                            cursor: "pointer",
                            color: "#1d4ed8",
                            backgroundImage:
                              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%231d4ed8' d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z'/><path fill='%231d4ed8' d='M20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/></svg>\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "18px 18px"
                          }}
                        >
                          {/* icon as background image */}
                        </button>
                        <button
                          disabled={loading}
                          title="Supprimer"
                          aria-label="Supprimer"
                          style={{
                            width: 28,
                            height: 28,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "transparent",
                            border: "1px solid #b91c1c",
                            borderRadius: 6,
                            cursor: loading ? "not-allowed" : "pointer",
                            color: "#b91c1c",
                            backgroundImage:
                              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23b91c1c' d='M6 7h12l-1 12H7L6 7z'/><path fill='%23b91c1c' d='M9 7V5h6v2'/><rect x='9' y='10' width='2' height='6' fill='%23b91c1c'/><rect x='13' y='10' width='2' height='6' fill='%23b91c1c'/></svg>\")",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "18px 18px"
                          }}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            if (loading) return;
                            if (t.status === "assigne_technicien" || t.status === "en_cours") {
                              alert("Le ticket est déjà en cours de traitement");
                              return;
                            }
                            setConfirmDeleteTicket(t);
                          }}
                        >
                          {/* icon as background image */}
                        </button>
                        {t.status === "resolu" ? (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setValidationTicket(t.id);
                                setShowRejectionForm(false);
                                setRejectionReason("");
                              }}
                              disabled={loading}
                              style={{ fontSize: "11px", padding: "4px 8px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            >
                              Valider
                            </button>
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setValidationTicket(t.id);
                                setShowRejectionForm(true);
                                setRejectionReason("");
                              }}
                              disabled={loading}
                              style={{ fontSize: "11px", padding: "4px 8px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            >
                              Rejeter
                            </button>
                          </div>
                        ) : t.status === "cloture" && t.feedback_score ? (
                          <span style={{ color: "#28a745", fontSize: "12px" }}>
                            ✓ Avis donné ({t.feedback_score}/5)
                          </span>
                        ) : null}
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

      {showEditModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", padding: "32px", borderRadius: "12px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ fontSize: "24px", fontWeight: "700", color: "#333" }}>Modifier le ticket</h3>
              <button
                onClick={() => { setShowEditModal(false); setEditTicketId(null); }}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#999" }}
              >
                ×
              </button>
            </div>
            <form onSubmit={async (e) => { await handleEditSubmit(e); }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Titre</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }} />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Description</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} required rows={4} style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px", resize: "vertical" }} />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Type</label>
                <select value={editType} onChange={(e) => { setEditType(e.target.value); setEditCategory(""); }} style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}>
                  <option value="materiel">Matériel</option>
                  <option value="applicatif">Applicatif</option>
                </select>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Catégorie</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}>
                  <option value="">Sélectionner une catégorie...</option>
                  {(editType === "materiel" ? CATEGORIES_MATERIEL : CATEGORIES_APPLICATIF).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Priorité</label>
                <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}>
                  <option value="faible">Faible</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="haute">Haute</option>
                  <option value="critique">Critique</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="submit" style={{ flex: 1, padding: "8px 16px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>Enregistrer</button>
                <button type="button" onClick={() => { setShowEditModal(false); setEditTicketId(null); }} style={{ flex: 1, padding: "8px 16px", backgroundColor: "#6b7280", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <h3 style={{ marginBottom: "16px" }}>Détails du ticket #{ticketDetails.number}</h3>
            <div style={{ marginBottom: "16px" }}>
              <strong>Titre :</strong>
              <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px" }}>
                {ticketDetails.title}
              </p>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <strong>Description :</strong>
              <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px", whiteSpace: "pre-wrap" }}>
                {ticketDetails.description || ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
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
              {ticketDetails.creator && (
                <div>
                  <strong>Créateur :</strong>
                  <span style={{ marginLeft: "8px" }}>
                    {ticketDetails.creator.full_name}
                  </span>
                </div>
              )}
            </div>
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
                onClick={() => setViewTicketDetails(null)}
                style={{ padding: "8px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
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
              padding: "32px",
              borderRadius: "12px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h3 style={{ fontSize: "24px", fontWeight: "700", color: "#333" }}>Créer un nouveau ticket</h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setError(null);
                    setTitle("");
                    setDescription("");
                    setPriority("moyenne");
                    setType("materiel");
                    setCategory("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "24px",
                    cursor: "pointer",
                    color: "#999"
                  }}
                >
                  ×
                </button>
              </div>
              {error && (
                <div style={{
                  padding: "12px",
                  marginBottom: "16px",
                  background: "#ffebee",
                  color: "#c62828",
                  borderRadius: "4px",
                  border: "1px solid #ef5350"
                }}>
                  <strong>Erreur :</strong> {error}
                </div>
              )}
              <form onSubmit={async (e) => {
                await handleCreate(e);
              }}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Titre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={loading}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={loading}
            rows={4}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px", resize: "vertical" }}
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Type</label>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              // Réinitialiser la catégorie quand le type change
              setCategory("");
            }}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
          >
            <option value="materiel">Matériel</option>
            <option value="applicatif">Applicatif</option>
          </select>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Catégorie</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loading}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
          >
            <option value="">Sélectionner une catégorie...</option>
            {(type === "materiel" ? CATEGORIES_MATERIEL : CATEGORIES_APPLICATIF).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Priorité</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
          >
            <option value="faible">Faible</option>
            <option value="moyenne">Moyenne</option>
            <option value="haute">Haute</option>
            <option value="critique">Critique</option>
          </select>
        </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                  <button type="submit" disabled={loading || !title.trim() || !description.trim()} style={{
                    flex: 1,
                    padding: "8px 16px",
                    backgroundColor: "#475569",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "500"
                  }}>
                    {loading ? "Création en cours..." : "Soumettre le ticket"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setError(null);
                      setTitle("");
                      setDescription("");
                      setPriority("moyenne");
                      setType("materiel");
                      setCategory("");
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "transparent",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#1f2937"
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmDeleteTicket && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "white", padding: "24px", borderRadius: "12px", maxWidth: "420px", width: "90%" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#1f2937", marginBottom: "12px" }}>Êtes-vous sûr ?</h3>
              <p style={{ color: "#4b5563", marginBottom: "16px" }}>
                Cette action supprimera définitivement le ticket #{confirmDeleteTicket.number}. 
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <button 
                  type="button" 
                  onClick={() => setConfirmDeleteTicket(null)} 
                  style={{ flex: 1, padding: "10px 16px", backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "14px", color: "#111827" }}
                >
                  Annuler
                </button>
                <button 
                  type="button" 
                  onClick={async () => { 
                    await handleDelete(confirmDeleteTicket); 
                    setConfirmDeleteTicket(null); 
                  }} 
                  style={{ flex: 1, padding: "10px 16px", backgroundColor: "#ef4444", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", color: "white" }}
                >
                  Oui
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de validation */}
        {validationTicket && (
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
                    {!showRejectionForm ? (
                      <>
                    <h3 style={{ marginBottom: "16px" }}>Valider la résolution</h3>
                    <p style={{ marginBottom: "16px", color: "#666" }}>
                      Le problème a-t-il été résolu de manière satisfaisante ?
                    </p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                      <button
                        onClick={() => handleValidateTicket(validationTicket, true)}
                        disabled={loading}
                        style={{ flex: 1, padding: "10px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Oui, valider
                      </button>
                      <button
                            onClick={() => {
                              setShowRejectionForm(true);
                              setRejectionReason("");
                            }}
                        disabled={loading}
                        style={{ flex: 1, padding: "10px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Non, rejeter
                      </button>
                      <button
                            onClick={() => {
                              setValidationTicket(null);
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                        style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Annuler
                      </button>
                    </div>
                      </>
                    ) : (
                      <>
                        <h3 style={{ marginBottom: "16px", color: "#dc3545" }}>Rejeter la résolution</h3>
                        <p style={{ marginBottom: "16px", color: "#666" }}>
                          Veuillez indiquer le motif de rejet. Cette information sera transmise au technicien pour l'aider à mieux résoudre votre problème.
                        </p>
                        <div style={{ marginBottom: "16px" }}>
                          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                            Motif de rejet <span style={{ color: "#dc3545" }}>*</span>
                          </label>
                          <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Exemple: Le problème persiste toujours, la solution proposée ne fonctionne pas, j'ai besoin de plus d'informations..."
                            rows={4}
                            required
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              fontSize: "14px",
                              resize: "vertical",
                              fontFamily: "inherit"
                            }}
                          />
                  </div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                          <button
                            onClick={() => handleValidateTicket(validationTicket, false)}
                            disabled={loading || !rejectionReason.trim()}
                            style={{ 
                              flex: 1, 
                              padding: "10px", 
                              backgroundColor: rejectionReason.trim() ? "#dc3545" : "#ccc", 
                              color: "white", 
                              border: "none", 
                              borderRadius: "4px", 
                              cursor: rejectionReason.trim() ? "pointer" : "not-allowed" 
                            }}
                          >
                            Confirmer le rejet
                          </button>
                          <button
                            onClick={() => {
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                            disabled={loading}
                            style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer" }}
                          >
                            Retour
                          </button>
                          <button
                            onClick={() => {
                              setValidationTicket(null);
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                            style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer" }}
                          >
                            Annuler
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
        )}

        {/* Modal de feedback */}
        {feedbackTicket && (
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
                    <h3 style={{ marginBottom: "16px" }}>Formulaire de satisfaction</h3>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
                        Notez votre satisfaction (1-5) :
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            onClick={() => setFeedbackScore(score)}
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              border: "2px solid",
                              borderColor: feedbackScore === score ? "#007bff" : "#ddd",
                              background: feedbackScore === score ? "#007bff" : "white",
                              color: feedbackScore === score ? "white" : "#333",
                              cursor: "pointer",
                              fontSize: "18px",
                              fontWeight: "bold"
                            }}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
                        Commentaire (optionnel) :
                      </label>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Votre avis..."
                        rows={4}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          resize: "vertical"
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                      <button
                        onClick={() => handleSubmitFeedback(feedbackTicket)}
                        disabled={loading || feedbackScore < 1 || feedbackScore > 5}
                        style={{ flex: 1, padding: "10px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Envoyer
                      </button>
                      <button
                        onClick={() => {
                          setFeedbackTicket(null);
                          setFeedbackScore(5);
                          setFeedbackComment("");
                        }}
                        style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              )}

        {/* Modal de notifications */}
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
      </div>
    </div>
  );
}

export default UserDashboard;
