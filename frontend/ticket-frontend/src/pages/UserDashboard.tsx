import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { PanelLeft, AlertCircle, Clock, CheckCircle } from "lucide-react";

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
  type?: string;
  category?: string | null;
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
  user?: {
    full_name: string;
  } | null;
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
  
  interface TicketTypeConfig {
    id: string;
    code: string;
    label: string;
  }

  interface TicketCategoryConfig {
    id: string;
    name: string;
    description?: string | null;
    type_code: string;
  }
  
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
  const [showNotificationsTicketsView, setShowNotificationsTicketsView] = useState<boolean>(false);
  const [notificationsTickets, setNotificationsTickets] = useState<Ticket[]>([]);
  const [selectedNotificationTicket, setSelectedNotificationTicket] = useState<string | null>(null);
  const [selectedNotificationTicketDetails, setSelectedNotificationTicketDetails] = useState<Ticket | null>(null);
  const [viewTicketDetails, setViewTicketDetails] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [resumedFlags, setResumedFlags] = useState<Record<string, boolean>>({});
  const [confirmDeleteTicket, setConfirmDeleteTicket] = useState<Ticket | null>(null);
  const [openActionsMenuFor, setOpenActionsMenuFor] = useState<string | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeConfig[]>([]);
  const [ticketCategories, setTicketCategories] = useState<TicketCategoryConfig[]>([]);
  
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

  // Charger les types et catégories de tickets depuis l'API
  useEffect(() => {
    async function loadTicketConfig() {
      try {
        const tokenToUse = actualToken || localStorage.getItem("token") || "";
        if (!tokenToUse || tokenToUse.trim() === "") {
          return;
        }

        const [typesRes, categoriesRes] = await Promise.all([
          fetch("http://localhost:8000/ticket-config/types", {
            headers: { Authorization: `Bearer ${tokenToUse}` },
          }),
          fetch("http://localhost:8000/ticket-config/categories", {
            headers: { Authorization: `Bearer ${tokenToUse}` },
          }),
        ]);

        if (typesRes.ok) {
          const typesData = await typesRes.json();
          setTicketTypes(typesData);
          // Si aucun type sélectionné, prendre le premier type actif
          if (!type && typesData.length > 0) {
            setType(typesData[0].code);
          }
          if (!editType && typesData.length > 0) {
            setEditType(typesData[0].code);
          }
        }

        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          setTicketCategories(categoriesData);
        }
      } catch (err) {
        console.error("Erreur lors du chargement des types/catégories:", err);
      }
    }

    void loadTicketConfig();
  }, [actualToken]);

  async function loadTickets() {
    let tokenToUse = actualToken;
    if (!tokenToUse || tokenToUse.trim() === "") {
      const storedToken = localStorage.getItem("token");
      if (!storedToken || storedToken.trim() === "") {
        console.warn("Pas de token pour charger les tickets");
        return;
      }
      tokenToUse = storedToken;
    }
    try {
      const res = await fetch("http://localhost:8000/tickets/me", {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
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

  // Fonction pour obtenir le message d'erreur selon le statut du ticket
  function getBlockedMessage(ticket: Ticket, action: "modification" | "suppression"): string {
    if (ticket.status === "cloture") {
      return `Ce ticket est déjà clôturé. ${action === "modification" ? "Modification" : "Suppression"} impossible.`;
    }
    if (ticket.status === "resolu") {
      return `Ce ticket est déjà résolu. ${action === "modification" ? "Modification" : "Suppression"} impossible.`;
    }
    if (ticket.status === "rejete") {
      return `Ce ticket est rejeté. ${action === "modification" ? "Modification" : "Suppression"} impossible.`;
    }
    if (ticket.status === "assigne_technicien" || ticket.status === "en_cours" || ticket.technician !== null) {
      return `Ce ticket est déjà assigné ou en cours de traitement. ${action === "modification" ? "Modification" : "Suppression"} impossible.`;
    }
    return `Ce ticket ne peut pas être ${action === "modification" ? "modifié" : "supprimé"}.`;
  }

  function openEditModal(ticket: Ticket) {
    // Vérifier si le ticket peut être modifié (non assigné et statut en attente)
    const isAssigned = ticket.technician !== null && ticket.technician !== undefined;
    const blockedStatuses = ["assigne_technicien", "en_cours", "cloture", "resolu", "rejete"];
    const isBlocked = blockedStatuses.includes(ticket.status) || isAssigned;
    
    if (isBlocked) {
      alert(getBlockedMessage(ticket, "modification"));
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
    // Vérifier si le ticket peut être supprimé (non assigné et statut en attente)
    const isAssigned = ticket.technician !== null && ticket.technician !== undefined;
    const blockedStatuses = ["assigne_technicien", "en_cours", "cloture", "resolu", "rejete"];
    const isBlocked = blockedStatuses.includes(ticket.status) || isAssigned;
    
    if (isBlocked) {
      alert(getBlockedMessage(ticket, "suppression"));
      return;
    }
    
    let tokenToUse = actualToken;
    if (!tokenToUse || tokenToUse.trim() === "") {
      const storedToken = localStorage.getItem("token");
      if (!storedToken || storedToken.trim() === "") {
        alert("Erreur d'authentification : veuillez vous reconnecter");
        return;
      }
      tokenToUse = storedToken;
    }
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
      });
      if (res.ok || res.status === 204) {
        // Supprimer le ticket de la liste immédiatement
        setTickets(prev => prev.filter(t => t.id !== ticket.id));
        // Recharger la liste pour s'assurer de la synchronisation
        await loadTickets();
        await loadUnreadCount();
        await loadNotifications();
        alert("Ticket supprimé avec succès");
      } else if (res.status === 403) {
        const errText = await res.text();
        alert(errText || "Le ticket est déjà en cours de traitement");
      } else if (res.status === 404) {
        // Le ticket n'existe plus, le retirer de la liste
        setTickets(prev => prev.filter(t => t.id !== ticket.id));
      } else {
        const errText = await res.text();
        alert(errText || "Erreur lors de la suppression du ticket");
      }
    } catch (err) {
      console.error("Erreur lors de la suppression du ticket:", err);
      alert("Erreur lors de la suppression du ticket. Veuillez réessayer.");
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

  async function clearAllNotifications() {
    try {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (actualToken && actualToken.trim() !== "" && unreadIds.length > 0) {
        await Promise.all(
          unreadIds.map((id) =>
            fetch(`http://localhost:8000/notifications/${id}/read`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${actualToken}` },
            })
          )
        );
      }
    } catch {}
    setNotifications([]);
    setUnreadCount(0);
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

  async function loadNotificationsTickets() {
    if (!actualToken || notifications.length === 0) {
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
              Authorization: `Bearer ${actualToken}`,
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
                Authorization: `Bearer ${actualToken}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              setSelectedNotificationTicketDetails(data);
              await loadTicketHistory(selectedNotificationTicket);
            }
          } catch (err) {
            console.error("Erreur chargement détails:", err);
          }
        }
      }
    } catch (err) {
      console.error("Erreur lors du chargement des tickets avec notifications:", err);
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
        alert(validated ? "Ticket validé et clôturé avec succès !" : "Ticket relancé. Le technicien a été notifié avec le motif.");
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
  const [dashboardSearch, setDashboardSearch] = useState<string>("");
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<string>("");
  const [dashboardPriorityFilter, setDashboardPriorityFilter] = useState<string>("");
  const [selectedFilterValue, setSelectedFilterValue] = useState<string>("");
 
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
      case "en_attente_analyse": return "En attente d'assignation";
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="4" rx="1" />
              <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="16" y2="14" />
              <line x1="8" y1="18" x2="12" y2="18" />
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "14px", 
            color: "white"
          }}>FAQ & Aide</div>
        </div>
        {/* Section Déconnexion + utilisateur en bas */}
        <div style={{ marginTop: "auto" }}>
          {/* Bouton Déconnexion */}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(59, 130, 246, 0.2)",
          zIndex: 99,
          transition: "left 0.3s ease"
        }}>
          {/* Left side - Empty to maintain top bar size */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          </div>

          {/* Right side - Icons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
            {/* Welcome message */}
            {userInfo && (
              <span style={{ 
                color: "white", 
                fontSize: "14px", 
                fontWeight: "400",
                fontFamily: "system-ui, -apple-system, sans-serif",
                marginRight: "8px"
              }}>
                Bienvenue Dans Votre Espace Utilisateur, {userInfo.full_name.toUpperCase()}
              </span>
            )}
            
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

            {/* Chat Icon - DSI style */}
            <div
              style={{
                width: "24px",
                height: "24px",
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                color: "white",
                cursor: "pointer"
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor"/>
                <path d="M19 13a2 2 0 0 1-2 2H5l-4 4V3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor" opacity="0.6" transform="translate(2, 2)"/>
              </svg>
            </div>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* Bell Icon with Notification - DSI style */}
            <div 
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ 
                width: "24px",
                height: "24px",
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                color: "white",
                cursor: "pointer",
                position: "relative"
              }}
            >
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

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* User block removed from top bar per request */}
          </div>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: activeSection === "notifications" ? "hidden" : "auto", paddingTop: "80px" }}>
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

            {/* Message d'accueil */}
            <div style={{ marginBottom: "30px" }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>
                Bonjour {userInfo?.full_name ? userInfo.full_name.split(' ')[0] : 'Jean'} 👋
              </div>
              <div style={{ fontSize: "16px", color: "#4b5563", lineHeight: "1.5" }}>
                Comment pouvons-nous vous aider aujourd'hui ? Notre équipe technique est là pour vous.
              </div>
            </div>

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
                  flexDirection: "column",
                  alignItems: "flex-start", 
                  justifyContent: "space-between",
                  padding: "14px",
                  borderRadius: "12px",
                  background: "white",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  minHeight: "100px"
                }}
              >
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start",
                  width: "100%",
                  marginBottom: "8px"
                }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#fff4e6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <AlertCircle size={16} color="#ea580c" />
                  </div>
                </div>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#1f2937", marginBottom: "4px" }}>
                  {statusCounts.en_attente_analyse}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "500", color: "#4b5563" }}>En attente d'assignation</span>
              </div>

              {/* En cours */}
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
                  minHeight: "100px"
                }}
              >
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start",
                  width: "100%",
                  marginBottom: "8px"
                }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <Clock size={16} color="#0284c7" />
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "11px", fontWeight: "500" }}>
                    En traitement
                  </div>
                </div>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#111827", marginBottom: "4px" }}>
                  {statusCounts.en_cours}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "500", color: "#4b5563" }}>Tickets en cours</span>
              </div>

              {/* Résolu */}
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
                  minHeight: "100px"
                }}
              >
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start",
                  width: "100%",
                  marginBottom: "8px"
                }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "#dcfce7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <CheckCircle size={16} color="#16a34a" />
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "11px", fontWeight: "500" }}>
                    Ce mois-ci
                  </div>
                </div>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#1f2937", marginBottom: "4px" }}>
                  {statusCounts.resolu}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "500", color: "#4b5563" }}>Tickets Résolus</span>
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
                            background: t.status === "en_attente_analyse" ? "#fef3c7" : t.status === "assigne_technicien" ? "#f0f9ff" : t.status === "en_cours" ? "#fed7aa" : t.status === "resolu" ? "#d4edda" : t.status === "rejete" ? "#fee2e2" : "#e5e7eb",
                            color: t.status === "en_attente_analyse" ? "#92400e" : t.status === "assigne_technicien" ? "#0c4a6e" : t.status === "en_cours" ? "#9a3412" : t.status === "resolu" ? "#155724" : t.status === "rejete" ? "#991b1b" : "#374151",
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
                            {t.status === "en_attente_analyse" ? "En attente d'assignation" :
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
                            background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
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
            {(activeSection === "dashboard" || activeSection === "tickets") && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                marginBottom: "16px"
              }}>
                <input
                  type="text"
                  placeholder="Rechercher par ticket, titre ou description..."
                  value={dashboardSearch}
                  onChange={(e) => setDashboardSearch(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    fontSize: "14px",
                    background: "white"
                  }}
                />
                <select
                  value={dashboardStatusFilter}
                  onChange={(e) => setDashboardStatusFilter(e.target.value)}
                  style={{ 
                    padding: "10px 12px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "8px",
                    fontSize: "14px",
                    background: "white",
                    minWidth: "160px"
                  }}
                >
                  <option value="">Tous les statuts</option>
                  <option value="en_attente_analyse">En attente d'assignation</option>
                  <option value="assigne_technicien">Assigné au technicien</option>
                  <option value="en_cours">En cours</option>
                  <option value="resolu">Résolu</option>
                  <option value="rejete">Rejeté</option>
                  <option value="cloture">Clôturé</option>
                </select>
                <select
                  value={dashboardPriorityFilter}
                  onChange={(e) => setDashboardPriorityFilter(e.target.value)}
                  style={{ 
                    padding: "10px 12px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "8px",
                    fontSize: "14px",
                    background: "white",
                    minWidth: "140px"
                  }}
                >
                  <option value="">Toutes les priorités</option>
                  <option value="critique">Critique</option>
                  <option value="haute">Haute</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="faible">Faible</option>
                </select>
              </div>
            )}
            {/* Tickets Table */}
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                // Important : laisser les menus d'actions dépasser de la carte (pour voir "Supprimer" en bas de la liste)
                overflow: "visible",
              }}
            >
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
                (activeSection === "dashboard" || activeSection === "tickets"
                  ? tickets.filter((t) => {
                    const search = dashboardSearch.trim().toLowerCase();
                    const matchesSearch = !search || 
                      t.number.toString().includes(search) ||
                      t.title.toLowerCase().includes(search) ||
                      (t.description || "").toLowerCase().includes(search);
                    const matchesStatus = !dashboardStatusFilter || t.status === dashboardStatusFilter;
                    const matchesPriority = !dashboardPriorityFilter || t.priority === dashboardPriorityFilter;
                    return matchesSearch && matchesStatus && matchesPriority;
                  })
                  : tickets)
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
                        background: t.status === "en_attente_analyse" ? "#fef3c7" : t.status === "assigne_technicien" ? "#f0f9ff" : t.status === "en_cours" ? "#fed7aa" : t.status === "resolu" ? "#d4edda" : t.status === "rejete" ? "#fee2e2" : t.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                        color: t.status === "en_attente_analyse" ? "#92400e" : t.status === "assigne_technicien" ? "#0c4a6e" : t.status === "en_cours" ? "#9a3412" : t.status === "resolu" ? "#155724" : t.status === "rejete" ? "#991b1b" : t.status === "cloture" ? "#374151" : "#374151",
                        whiteSpace: "nowrap",
                        display: "inline-block"
                      }}>
                        {t.status === "en_attente_analyse" ? "En attente d'assignation" :
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
                        background: t.priority === "critique" ? "#fee2e2" : t.priority === "haute" ? "#fed7aa" : t.priority === "moyenne" ? "#dbeafe" : t.priority === "faible" ? "#fee2e2" : "#e5e7eb",
                        color: t.priority === "critique" ? "#991b1b" : t.priority === "haute" ? "#92400e" : t.priority === "moyenne" ? "#1e40af" : t.priority === "faible" ? "#991b1b" : "#374151"
                      }}>
                        {t.priority}
                      </span>
                    </td>
                    <td style={{ padding: "16px", fontSize: "14px", color: "#333" }}>
                      {formatDate(t.assigned_at || t.created_at)}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
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
                                  const menuHeight = 150; // Hauteur approximative du menu (3 boutons)
                                  const spaceBelow = viewportHeight - rect.bottom;
                                  const spaceAbove = rect.top;
                                  
                                  // Si pas assez d'espace en bas mais assez en haut, afficher vers le haut
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
                              Voir détails
                            </button>
                            <button
                              onClick={() => { 
                                const isAssigned = t.technician !== null && t.technician !== undefined;
                                const blockedStatuses = ["assigne_technicien", "en_cours", "cloture", "resolu", "rejete"];
                                const isBlocked = blockedStatuses.includes(t.status) || isAssigned;
                                
                                if (isBlocked) {
                                  alert(getBlockedMessage(t, "modification"));
                                  setOpenActionsMenuFor(null);
                                  return;
                                }
                                openEditModal(t); 
                                setOpenActionsMenuFor(null); 
                              }}
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
                              Modifier
                            </button>
                            <button
                              onClick={() => { 
                                if (loading) return;
                                const isAssigned = t.technician !== null && t.technician !== undefined;
                                const blockedStatuses = ["assigne_technicien", "en_cours", "cloture", "resolu", "rejete"];
                                const isBlocked = blockedStatuses.includes(t.status) || isAssigned;
                                
                                if (isBlocked) {
                                  alert(getBlockedMessage(t, "suppression"));
                                  setOpenActionsMenuFor(null);
                                  return;
                                }
                                setConfirmDeleteTicket(t); 
                                setOpenActionsMenuFor(null);
                              }}
                              disabled={loading}
                              style={{ 
                                width: "100%", 
                                padding: "10px 12px", 
                                background: "transparent", 
                                border: "none", 
                                borderTop: "1px solid #e5e7eb",
                                textAlign: "left", 
                                cursor: "pointer",
                                color: "#b91c1c",
                                fontSize: "14px",
                                fontWeight: 500,
                                display: "block",
                                whiteSpace: "nowrap"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#fee2e2";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
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
                              Relancer
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

      {/* Section Notifications dans le contenu principal */}
      {activeSection === "notifications" && (
        <div style={{
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
                notificationsTickets.map((ticket) => {
                  const ticketNotifications = notifications.filter(n => n.ticket_id === ticket.id);
                  const unreadCount = ticketNotifications.filter(n => !n.read).length;
                  const isSelected = selectedNotificationTicket === ticket.id;
                  
                  return (
                    <div
                      key={ticket.id}
                      onClick={async () => {
                        setSelectedNotificationTicket(ticket.id);
                        try {
                          const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
                            headers: {
                              Authorization: `Bearer ${actualToken}`,
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
                  background: "white",
                  borderRadius: "0 8px 0 0"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails du ticket #{selectedNotificationTicketDetails.number}</h3>
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
                    {selectedNotificationTicketDetails.type && (
                      <div>
                        <strong>Type :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#e3f2fd", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.type === "materiel" ? "Matériel" : "Applicatif"}
                        </span>
                      </div>
                    )}
                    <div>
                      <strong>Priorité :</strong>
                      <span style={{
                        marginLeft: "8px",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "500",
                        background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "#fed7aa" : selectedNotificationTicketDetails.priority === "moyenne" ? "#ffc107" : "#9e9e9e",
                        color: selectedNotificationTicketDetails.priority === "haute" ? "#92400e" : "white"
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
                        ticketHistory.map((h) => (
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
                <select
                  value={editType}
                  onChange={(e) => {
                    setEditType(e.target.value);
                    setEditCategory("");
                  }}
                  style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
                >
                  {ticketTypes.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "500" }}>Catégorie</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}
                >
                  <option value="">Sélectionner une catégorie...</option>
                  {ticketCategories
                    .filter((c) => c.type_code === editType)
                    .map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
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
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              <div>
                <strong>Priorité :</strong>
                <span style={{
                  marginLeft: "8px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "500",
                  background: ticketDetails.priority === "critique" ? "#f44336" : ticketDetails.priority === "haute" ? "#fed7aa" : ticketDetails.priority === "moyenne" ? "#ffc107" : "#9e9e9e",
                  color: ticketDetails.priority === "haute" ? "#92400e" : "white"
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
              {ticketDetails.creator && (
                <div>
                  <strong>Créateur :</strong>
                  <span style={{ marginLeft: "8px" }}>
                    {ticketDetails.creator.full_name}
                  </span>
                </div>
              )}
              {ticketDetails.technician && (
                <div>
                  <strong>Technicien assigné :</strong>
                  <span style={{ marginLeft: "8px" }}>
                    {ticketDetails.technician.full_name}
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
            {ticketTypes.map((t) => (
              <option key={t.id} value={t.code}>
                {t.label}
              </option>
            ))}
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
            {ticketCategories
              .filter((c) => c.type_code === type)
              .map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
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
                        Non, relancer
                      </button>
                      <button
                            onClick={() => {
                              setValidationTicket(null);
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                        style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", color: "#333" }}
                      >
                        Annuler
                      </button>
                    </div>
                      </>
                    ) : (
                      <>
                        <h3 style={{ marginBottom: "16px", color: "#dc3545" }}>Relancer la résolution</h3>
                        <p style={{ marginBottom: "16px", color: "#666" }}>
                          Veuillez indiquer le motif de relance. Cette information sera transmise au technicien pour l'aider à mieux résoudre votre problème.
                        </p>
                        <div style={{ marginBottom: "16px" }}>
                          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                            Motif de relance <span style={{ color: "#dc3545" }}>*</span>
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
                              backgroundColor: "#dc3545", 
                              color: "white", 
                              border: "none", 
                              borderRadius: "4px", 
                              cursor: rejectionReason.trim() ? "pointer" : "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              whiteSpace: "nowrap"
                            }}
                          >
                            Confirmer la relance
                          </button>
                          <button
                            onClick={() => {
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                            disabled={loading}
                            style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", color: "#000" }}
                          >
                            Retour
                          </button>
                          <button
                            onClick={() => {
                              setValidationTicket(null);
                              setShowRejectionForm(false);
                              setRejectionReason("");
                            }}
                            style={{ flex: 1, padding: "10px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", color: "#000" }}
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
                  notifications.map((notif) => (
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
                    notificationsTickets.map((ticket) => {
                      const ticketNotifications = notifications.filter(n => n.ticket_id === ticket.id);
                      const unreadCount = ticketNotifications.filter(n => !n.read).length;
                      const isSelected = selectedNotificationTicket === ticket.id;
                      
                      return (
                        <div
                          key={ticket.id}
                          onClick={async () => {
                            setSelectedNotificationTicket(ticket.id);
                            try {
                              const res = await fetch(`http://localhost:8000/tickets/${ticket.id}`, {
                                headers: {
                                  Authorization: `Bearer ${actualToken}`,
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
                      padding: "28px 20px 20px 20px",
                      borderBottom: "1px solid #e0e0e0",
                      background: "white",
                      borderRadius: "0 8px 0 0"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails du ticket #{selectedNotificationTicketDetails.number}</h3>
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
                          <strong>Priorité :</strong>
                          <span style={{
                            marginLeft: "8px",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "#fed7aa" : selectedNotificationTicketDetails.priority === "moyenne" ? "#ffc107" : "#9e9e9e",
                            color: selectedNotificationTicketDetails.priority === "haute" ? "#92400e" : "white"
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

                      {selectedNotificationTicketDetails.technician && (
                        <div style={{ marginBottom: "16px" }}>
                          <strong>Technicien assigné :</strong>
                          <p style={{ marginTop: "4px" }}>
                            {selectedNotificationTicketDetails.technician.full_name}
                          </p>
                        </div>
                      )}

                      <div style={{ marginTop: "24px", marginBottom: "16px" }}>
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
    </div>
  );
}

export default UserDashboard;
