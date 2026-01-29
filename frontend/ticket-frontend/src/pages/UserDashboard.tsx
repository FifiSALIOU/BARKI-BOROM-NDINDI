import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, CheckCircle, LayoutDashboard, PlusCircle, Ticket, ChevronLeft, ChevronRight, Bell, Wrench, Monitor, Search, Send, Info, CheckCircle2, AlertTriangle, XCircle, Check, Pencil, Trash2, RefreshCcw, FileText, UserCheck, Users } from "lucide-react";
import helpdeskLogo from "../assets/helpdesk-logo.png";

interface UserDashboardProps {
  token: string;
}

interface Ticket {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: string;
  priority: string | null;
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
  // Fonction helper pour formater le numéro de ticket en "TKT-XXX"
  const formatTicketNumber = (number: number): string => {
    return `TKT-${number.toString().padStart(3, '0')}`;
  };

  // Fonction helper pour formater le message de notification en remplaçant "#X" par "TKT-XXX"
  const formatNotificationMessage = (message: string): string => {
    // Remplacer les patterns "#X" ou "ticket #X" par "TKT-XXX"
    return message.replace(/#(\d+)/g, (match, number) => {
      const ticketNumber = parseInt(number, 10);
      return `TKT-${ticketNumber.toString().padStart(3, '0')}`;
    });
  };

  // Fonction helper pour formater la date relative
  const formatRelativeTime = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInMonths = Math.floor(diffInDays / 30);
    const diffInYears = Math.floor(diffInDays / 365);

    if (diffInYears > 0) {
      return `il y a environ ${diffInYears} an${diffInYears > 1 ? 's' : ''}`;
    } else if (diffInMonths > 0) {
      return `il y a environ ${diffInMonths} mois`;
    } else if (diffInDays > 0) {
      return `il y a environ ${diffInDays} jour${diffInDays > 1 ? 's' : ''}`;
    } else if (diffInHours > 0) {
      return `il y a environ ${diffInHours} heure${diffInHours > 1 ? 's' : ''}`;
    } else if (diffInMinutes > 0) {
      return `il y a environ ${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''}`;
    } else {
      return "à l'instant";
    }
  };

  // Fonction helper pour déterminer l'icône et les couleurs de la timeline d'historique
  const getHistoryVisuals = (entry: TicketHistory) => {
    const status = (entry.new_status || "").toLowerCase();
    const oldStatus = (entry.old_status || "").toLowerCase();
    const reason = (entry.reason || "").toLowerCase();

    let Icon = Clock;
    let iconBg = "#F3F4F6";
    let iconBorder = "#E5E7EB";
    let iconColor = "#111827";

    if (!entry.old_status || entry.new_status === "creation") {
      // Création du ticket
      Icon = FileText;
    } else if (
      // Détecter délégation à l'Adjoint DSI (en_attente_analyse → en_attente_analyse avec reason contenant "délégation")
      entry.old_status &&
      (oldStatus.includes("en_attente_analyse") || oldStatus.includes("en attente analyse")) &&
      (status.includes("en_attente_analyse") || status.includes("en attente analyse")) &&
      (reason.includes("délégation") || reason.includes("délégu") || reason.includes("delegat"))
    ) {
      // Délégation à l'Adjoint DSI
      Icon = Users;
    } else if (status.includes("assigne") || status.includes("assigné") || status.includes("assign")) {
      // Assignation
      Icon = UserCheck;
    } else if (status.includes("deleg") || status.includes("délégu")) {
      // Délégation (autres cas)
      Icon = Users;
    } else if (
      // Détecter rejet de résolution (resolu → rejete avec Validation utilisateur: Rejeté)
      (oldStatus.includes("resolu") || oldStatus.includes("résolu")) &&
      (status.includes("rejete") || status.includes("rejeté")) &&
      reason.includes("validation utilisateur: rejeté")
    ) {
      // Ticket relancé (rejet de résolution)
      Icon = RefreshCcw;
    } else if (
      status.includes("resolu") ||
      status.includes("résolu") ||
      status.includes("valide") ||
      status.includes("validé") ||
      status.includes("cloture") ||
      status.includes("clôture")
    ) {
      // Résolution / validation
      Icon = CheckCircle2;
      iconBg = "#ECFDF3";
      iconBorder = "#BBF7D0";
      iconColor = "#166534";
    } else if (status.includes("relance") || status.includes("relancé")) {
      // Relance
      Icon = RefreshCcw;
    }

    return { Icon, iconBg, iconBorder, iconColor };
  };

  // Formate la date/heure pour l'historique (ex. "02 janv. 2025 à 16:00")
  const formatHistoryDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    const day = d.toLocaleDateString("fr-FR", { day: "2-digit" });
    const month = d.toLocaleDateString("fr-FR", { month: "short" });
    const year = d.toLocaleDateString("fr-FR", { year: "numeric" });
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${day} ${month} ${year} à ${time}`;
  };

  // Historique affiché : "Création du ticket" en premier, puis le reste trié par date ascendante
  const getDisplayHistory = (ticket: Ticket, history: TicketHistory[]): TicketHistory[] => {
    const creation: TicketHistory = {
      id: `creation-${ticket.id}`,
      ticket_id: ticket.id,
      old_status: null,
      new_status: "creation",
      user_id: "",
      reason: null,
      changed_at: ticket.created_at,
      user: ticket.creator ? { full_name: ticket.creator.full_name } : null,
    };
    // Filtrer les entrées d'historique pour exclure les modifications par l'utilisateur
    const rest = history.filter((h) => {
      // Garder toutes les entrées qui ont un old_status
      if (h.old_status == null) return false;
      
      // Exclure les modifications par l'utilisateur
      const reason = (h.reason || "").toLowerCase();
      const isUserModification = reason.includes("ticket modifié par l'utilisateur") || 
                                  reason.includes("modifié par l'utilisateur") ||
                                  reason.includes("modification par l'utilisateur");
      
      // Vérifier si l'utilisateur qui a fait l'action est le créateur du ticket
      const isCreatorAction = ticket.creator && 
                              h.user && 
                              h.user.full_name === ticket.creator.full_name;
      
      // Exclure si c'est une modification par l'utilisateur créateur
      if (isUserModification && isCreatorAction) {
        return false;
      }
      
      return true;
    });
    const combined = [creation, ...rest];
    combined.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    return combined;
  };

  // Fonction helper pour déterminer le titre principal d'une entrée d'historique
  const getHistoryTitle = (entry: TicketHistory, ticket?: Ticket | null, allHistory?: TicketHistory[]): string => {
    const status = (entry.new_status || "").toLowerCase();

    if (!entry.old_status || entry.new_status === "creation") {
      return "Création du ticket";
    }

    if (status.includes("assigne") || status.includes("assigné") || status.includes("assign")) {
      // Pour l'assignation, utiliser le technicien assigné du ticket, pas la personne qui a fait l'assignation
      if (ticket?.technician?.full_name) {
        return `Assigné à ${ticket.technician.full_name}`;
      }
      return "Ticket assigné";
    }

    if (status.includes("deleg") || status.includes("délégu")) {
      return entry.user?.full_name ? `Délégué par ${entry.user.full_name}` : "Ticket délégué";
    }

    if (
      status.includes("resolu") ||
      status.includes("résolu") ||
      status.includes("valide") ||
      status.includes("validé") ||
      status.includes("cloture") ||
      status.includes("clôture")
    ) {
      // Si c'est une validation et clôture par l'utilisateur (resolu → cloture avec validation)
      const oldStatus = (entry.old_status || "").toLowerCase();
      const isValidationAndClosure = 
        (status.includes("cloture") || status.includes("clôture")) &&
        (oldStatus.includes("resolu") || oldStatus.includes("résolu")) &&
        entry.reason?.includes("Validation utilisateur: Validé");
      
      if (isValidationAndClosure) {
        return entry.user?.full_name ? `Validé par ${entry.user.full_name}` : "Ticket validé";
      }
      
      return entry.user?.full_name ? `Résolu par ${entry.user.full_name}` : "Ticket résolu";
    }

    if (status.includes("relance") || status.includes("relancé")) {
      return entry.user?.full_name ? `Relancé par ${entry.user.full_name}` : "Ticket relancé";
    }

    // Cas spécifique: rejet de résolution par l'utilisateur (resolu → rejete avec Validation utilisateur: Rejeté)
    if (entry.old_status && entry.new_status) {
      const oldStatus = (entry.old_status || "").toLowerCase();
      const newStatus = (entry.new_status || "").toLowerCase();
      const reason = (entry.reason || "").toLowerCase();
      
      // Détecter rejet de résolution : resolu → rejete avec "Validation utilisateur: Rejeté"
      if ((oldStatus.includes("resolu") || oldStatus.includes("résolu")) && 
          (newStatus.includes("rejete") || newStatus.includes("rejeté")) &&
          reason.includes("validation utilisateur: rejeté")) {
        return "Ticket relancé";
      }
      
      // Détecter reprise du ticket après relance : rejete → en_cours
      if ((oldStatus.includes("rejete") || oldStatus.includes("rejeté")) &&
          (newStatus.includes("en_cours") || newStatus.includes("en cours"))) {
        return "Ticket repris en charge par le technicien";
      }
    }

    // Cas spécifique: assigne_technicien → en_cours
    if (entry.old_status && entry.new_status) {
      const oldStatus = (entry.old_status || "").toLowerCase();
      const newStatus = (entry.new_status || "").toLowerCase();
      if ((oldStatus.includes("assigne_technicien") || oldStatus.includes("assigne technicien")) && 
          (newStatus.includes("en_cours") || newStatus.includes("en cours"))) {
        return "Ticket en cours de traitement";
      }
      // Cas spécifique: en_attente_analyse → en_attente_analyse
      if ((oldStatus.includes("en_attente_analyse") || oldStatus.includes("en attente analyse")) && 
          (newStatus.includes("en_attente_analyse") || newStatus.includes("en attente analyse"))) {
        // Vérifier si c'est une délégation à l'Adjoint DSI
        const reason = (entry.reason || "").toLowerCase();
        const isDelegation = reason.includes("délégation") || reason.includes("délégu") || reason.includes("delegat");
        
        if (isDelegation) {
          // Essayer d'obtenir le nom de l'Adjoint depuis le ticket (secretary_id)
          // Le ticket peut contenir secretary_id même si ce n'est pas dans l'interface TypeScript
          const ticketAny = ticket as any;
          if (ticketAny && ticketAny.secretary_id) {
            // Si le ticket a un secretary avec full_name, l'utiliser
            if (ticketAny.secretary && ticketAny.secretary.full_name) {
              return `Ticket Délégué à ${ticketAny.secretary.full_name}`;
            }
          }
          
          // Chercher dans l'historique suivant pour trouver qui a fait l'assignation
          // (l'Adjoint DSI qui a reçu la délégation fait généralement l'assignation ensuite)
          if (allHistory && allHistory.length > 0) {
            const currentIndex = allHistory.findIndex(h => h.id === entry.id);
            if (currentIndex !== -1) {
              // Chercher dans les entrées suivantes pour trouver une assignation
              for (let i = currentIndex + 1; i < allHistory.length; i++) {
                const nextEntry = allHistory[i];
                const nextStatus = (nextEntry.new_status || "").toLowerCase();
                // Si c'est une assignation (assigne_technicien) et que l'utilisateur existe
                if ((nextStatus.includes("assigne") || nextStatus.includes("assigné")) && nextEntry.user && nextEntry.user.full_name) {
                  // Vérifier si le reason mentionne "Secrétaire" ou "Adjoint" pour confirmer que c'est l'Adjoint DSI
                  const nextReason = (nextEntry.reason || "").toLowerCase();
                  if (nextReason.includes("secrétaire") || nextReason.includes("adjoint") || nextReason.includes("secretaire")) {
                    return `Ticket Délégué à ${nextEntry.user.full_name}`;
                  }
                }
              }
            }
          }
          
          // Essayer d'extraire le nom de l'Adjoint depuis le reason
          // Format possible: "Délégation au Adjoint DSI" ou "Délégation au [Nom]"
          const reasonUpper = entry.reason || "";
          // Chercher un nom après "au" ou "à" (format: "Délégation au [Nom]")
          const match = reasonUpper.match(/(?:au|à)\s+(?:Adjoint\s+DSI\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
          if (match && match[1] && match[1] !== "Adjoint" && match[1] !== "DSI") {
            return `Ticket Délégué à ${match[1]}`;
          }
          
          // Si pas de nom trouvé, utiliser "Adjoint DSI" par défaut
          return "Ticket Délégué à Adjoint DSI";
        }
        
        return "Ticket en attente d'assignation";
      }
    }

    if (entry.old_status) {
      return `${entry.old_status} → ${entry.new_status}`;
    }

    return entry.new_status;
  };

  // Fonction helper pour déterminer le type de notification
  const getNotificationType = (message: string): "info" | "success" | "warning" | "error" => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("résolu") || lowerMessage.includes("resolu") || lowerMessage.includes("clôturé") || lowerMessage.includes("cloture")) {
      return "success";
    } else if (lowerMessage.includes("relancé") || lowerMessage.includes("relance") || lowerMessage.includes("rejeté") || lowerMessage.includes("rejete")) {
      return "warning";
    } else if (lowerMessage.includes("erreur") || lowerMessage.includes("échec") || lowerMessage.includes("echec")) {
      return "error";
    }
    return "info";
  };

  // Fonction helper pour extraire le titre de la notification
  const getNotificationTitle = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("créé") || lowerMessage.includes("cree")) {
      return "Nouveau ticket créé";
    } else if (lowerMessage.includes("assigné") || lowerMessage.includes("assigne")) {
      return "Ticket assigné";
    } else if (lowerMessage.includes("résolu") || lowerMessage.includes("resolu")) {
      return "Ticket résolu";
    } else if (lowerMessage.includes("relancé") || lowerMessage.includes("relance")) {
      return "Ticket relancé";
    } else if (lowerMessage.includes("clôturé") || lowerMessage.includes("cloture")) {
      return "Ticket clôturé";
    } else if (lowerMessage.includes("en cours")) {
      return "Ticket en cours";
    }
    return "Notification";
  };

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
  const [showTicketDetailsPage, setShowTicketDetailsPage] = useState<boolean>(false);
  const [resumedFlags, setResumedFlags] = useState<Record<string, boolean>>({});
  const [confirmDeleteTicket, setConfirmDeleteTicket] = useState<Ticket | null>(null);
  const [openActionsMenuFor, setOpenActionsMenuFor] = useState<string | null>(null);
  const actionsMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeConfig[]>([]);
  const [ticketCategories, setTicketCategories] = useState<TicketCategoryConfig[]>([]);
  const [notificationSearch, setNotificationSearch] = useState<string>("");
  
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

  // Fermer le menu d'actions au clic en dehors
  useEffect(() => {
    if (openActionsMenuFor === null) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (actionsMenuContainerRef.current && !actionsMenuContainerRef.current.contains(target)) {
        setOpenActionsMenuFor(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openActionsMenuFor]);

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
      const res = await fetch("http://localhost:8000/notifications/?unread_only=true", {
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
    setEditPriority(ticket.priority ?? "");
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

  async function markTicketNotificationsAsRead(ticketId: string) {
    const unreadForTicket = notifications.filter((n) => n.ticket_id === ticketId && !n.read);
    if (unreadForTicket.length === 0 || !actualToken || actualToken.trim() === "") return;
    try {
      await Promise.all(
        unreadForTicket.map((n) =>
          fetch(`http://localhost:8000/notifications/${n.id}/read`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${actualToken}` },
          })
        )
      );
      await loadNotifications();
      await loadUnreadCount();
    } catch (err) {
      console.error("Erreur lors du marquage des notifications du ticket comme lues:", err);
    }
  }

  async function markAllAsRead() {
    if (!actualToken || actualToken.trim() === "") return;
    try {
      const res = await fetch("http://localhost:8000/notifications/read-all", {
        method: "PUT",
        headers: { Authorization: `Bearer ${actualToken}` },
      });
      if (res.ok) {
        await loadNotifications();
        await loadUnreadCount();
      }
    } catch (err) {
      console.error("Erreur lors du marquage de toutes les notifications comme lues:", err);
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
        setShowTicketDetailsPage(true);
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
    navigate("/dashboard/user/notifications");
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
            setUserInfo({ 
              full_name: data.full_name,
              role: data.role?.name || "Utilisateur"
            });
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
      navigate("/dashboard/user");
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

  const location = useLocation();
  const navigate = useNavigate();
  
  // Déterminer activeSection depuis l'URL
  const getActiveSection = () => {
    if (location.pathname === "/dashboard/user/notifications") return "notifications";
    if (location.pathname === "/dashboard/user/tickets") return "tickets";
    if (location.pathname === "/dashboard/user") return "dashboard";
    return "dashboard"; // Par défaut (pour /dashboard)
  };
  const activeSection = getActiveSection();
  
  // Charger les tickets avec notifications quand on entre dans la section notifications
  useEffect(() => {
    if (location.pathname === "/dashboard/user/notifications" && actualToken && notifications.length > 0) {
      void loadNotificationsTickets();
    }
  }, [location.pathname, actualToken, notifications]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const ticketsListRef = useRef<HTMLDivElement>(null);
  const [userInfo, setUserInfo] = useState<{ full_name: string; role?: string } | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [selectedCharacteristic, setSelectedCharacteristic] = useState<string>("");
  const [dashboardSearch, setDashboardSearch] = useState<string>("");
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<string>("");
  const [dashboardCategoryFilter, setDashboardCategoryFilter] = useState<string>("");
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
      case "rejete": return "Relancé";
      case "cloture": return "Clôturé";
      default: return status;
    }
  }

  // Fonction pour obtenir le libellé d'une priorité (null = non encore définie par DSI/Adjoint)
  function getPriorityLabel(priority: string | null): string {
    if (priority == null || priority === "") return "—";
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
        {/* HelpDesk Section */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginBottom: "8px", 
          paddingBottom: "8px", 
          borderBottom: "1px solid rgba(255,255,255,0.1)" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            {/* Logo HelpDesk */}
            <div style={{
              width: "40px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: "white",
              borderRadius: "0.75rem",
              padding: "2px"
            }}>
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
                : "U"}
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
                {userInfo.role || "Utilisateur"}
              </div>
            </div>
          </div>
        )}

        <div 
          onClick={() => {
            setShowTicketDetailsPage(false);
            setTicketDetails(null);
            setTicketHistory([]);
            setViewTicketDetails(null);
            navigate("/dashboard/user");
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            cursor: "pointer",
            background: activeSection === "dashboard" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            marginBottom: "8px"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <LayoutDashboard size={20} color={activeSection === "dashboard" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ 
            fontSize: "15px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: "500",
            color: "white"
          }}>Tableau de bord</div>
        </div>
        
        <div 
          onClick={() => setShowCreateModal(true)}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <PlusCircle size={20} color="rgba(180, 180, 180, 0.7)" />
          </div>
          <div style={{ 
            fontSize: "15px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: "500",
            color: "white"
          }}>Nouveau ticket</div>
        </div>
        <div 
          onClick={() => {
            navigate("/dashboard/user/tickets");
            setTimeout(() => {
              ticketsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            cursor: "pointer",
            background: activeSection === "tickets" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            marginBottom: "8px"
          }}
        >
          <div style={{ 
            width: "20px", 
            height: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center"
          }}>
            <Ticket size={20} color={activeSection === "tickets" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ 
            fontSize: "15px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: "500",
            color: "white"
          }}>Mes tickets</div>
        </div>
        <div 
          onClick={() => {}}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(180, 180, 180, 0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ 
            fontSize: "15px",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: "500",
            color: "white"
          }}>FAQ & Aide</div>
        </div>
        {/* Section Déconnexion + utilisateur en bas */}
        <div style={{ marginTop: "auto" }}>
          {/* Trait de séparation (même style qu'au-dessus de Tableau de bord) */}
          <div style={{
            height: "1px",
            background: "rgba(255, 255, 255, 0.1)",
            margin: "0 12px 8px 12px"
          }} />
          {/* Bouton Notifications */}
          <div 
            onClick={() => navigate("/dashboard/user/notifications")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px", 
              cursor: "pointer",
              position: "relative"
            }}
          >
            <div style={{ 
              width: "20px", 
              height: "20px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center"
            }}>
              <Bell size={20} color="rgba(180, 180, 180, 0.7)" />
            </div>
            <div style={{ 
              fontSize: "14px", 
              color: "white",
              flex: 1
            }}>Notifications</div>
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(59, 130, 246, 0.2)",
          zIndex: 99,
          transition: "left 0.3s ease"
        }}>
          {/* Left side - Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ 
              fontSize: "20px", 
              fontWeight: "700",
              color: "#111827",
              fontFamily: "system-ui, -apple-system, sans-serif"
            }}>
              {activeSection === "notifications" ? "Notifications" : activeSection === "tickets" ? "Tickets" : "Tableau de bord"}
            </div>
            <div style={{ 
              fontSize: "13px", 
              fontWeight: "400",
              color: "#6b7280",
              fontFamily: "system-ui, -apple-system, sans-serif",
              whiteSpace: activeSection === "dashboard" ? "nowrap" : undefined,
              paddingLeft: 0,
              marginLeft: 0,
              textAlign: "left"
            }}>
              {activeSection === "notifications" ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}` : activeSection === "tickets" ? "Gérez tous vos tickets" : "Vue d'ensemble de votre\u00A0activité"}
            </div>
          </div>

          {/* Right side - Icons */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Welcome message */}
            {userInfo && (
              <span style={{ 
                color: "white", 
                fontSize: "14px", 
                fontWeight: "400",
                fontFamily: "system-ui, -apple-system, sans-serif",
                marginRight: "16px"
              }}>
                Bienvenue Dans Votre Espace Utilisateur, {userInfo.full_name.toUpperCase()}
              </span>
            )}
            
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
                placeholder="Rechercher par ID, titre, description..."
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 40px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: "white",
                  outline: "none",
                  color: "#1f2937"
                }}
              />
            </div>
            
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

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }}></div>

            {/* User block removed from top bar per request */}
          </div>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: activeSection === "notifications" ? "hidden" : "auto", paddingTop: "80px" }}>
        {/* Affichage des détails du ticket en pleine page */}
        {showTicketDetailsPage && ticketDetails ? (
          <div>
            {/* Header avec bouton retour */}
            <div style={{ marginBottom: "24px" }}>
              <button
                onClick={() => {
                  setShowTicketDetailsPage(false);
                  setTicketDetails(null);
                  setTicketHistory([]);
                  // Rediriger vers la bonne section selon d'où on vient
                  if (activeSection === "notifications" || location.pathname === "/dashboard/user/notifications") {
                    navigate("/dashboard/user/notifications");
                  } else if (activeSection === "tickets" || location.pathname === "/dashboard/user/tickets") {
                    navigate("/dashboard/user/tickets");
                  } else {
                    navigate("/dashboard/user");
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#374151",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  marginBottom: "16px"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Retour
              </button>
              <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>
                Détails du ticket {formatTicketNumber(ticketDetails.number)}
              </h2>
            </div>

            {/* Contenu des détails du ticket */}
            <div style={{
              background: "white",
              padding: "24px",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}>
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
                {ticketDetails.priority != null && ticketDetails.priority !== "" && (
                  <div>
                    <strong>Priorité :</strong>
                    <span style={{
                      marginLeft: "8px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500",
                      background: ticketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : ticketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : ticketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : ticketDetails.priority === "faible" ? "#E5E7EB" : "#9e9e9e",
                      color: ticketDetails.priority === "critique" ? "#E53E3E" : ticketDetails.priority === "haute" ? "#F59E0B" : ticketDetails.priority === "moyenne" ? "#0DADDB" : ticketDetails.priority === "faible" ? "#6B7280" : "white"
                    }}>
                      {getPriorityLabel(ticketDetails.priority)}
                    </span>
                  </div>
                )}
                <div>
                  <strong>Catégorie :</strong>
                  <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
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
                  {(() => {
                    const displayHistory = getDisplayHistory(ticketDetails, ticketHistory);
                    if (displayHistory.length === 0) {
                      return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                    }
                    return displayHistory.map((h, index) => {
                      const { Icon, iconBg, iconBorder, iconColor } = getHistoryVisuals(h);
                      const isLast = index === displayHistory.length - 1;
                      const isCreation = h.new_status === "creation";

                      return (
                        <div key={h.id} style={{ display: "flex", gap: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "60px" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "9999px",
                                border: `2px solid ${iconBorder}`,
                                backgroundColor: iconBg,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: iconColor,
                                boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.15)",
                              }}
                            >
                              <Icon size={18} />
                            </div>
                            {!isLast && (
                              <div
                                style={{
                                  flexGrow: 1,
                                  width: "2px",
                                  backgroundColor: "#E5E7EB",
                                  marginTop: "4px",
                                  marginBottom: "-4px",
                                }}
                              />
                            )}
                          </div>
                          <div
                            style={{
                              padding: "8px 12px",
                              marginBottom: "12px",
                              background: "#F9FAFB",
                              borderRadius: "8px",
                              border: "1px solid #E5E7EB",
                              flex: 1,
                            }}
                          >
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                              {getHistoryTitle(h, ticketDetails, displayHistory)}
                            </div>
                            <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                              {formatHistoryDate(h.changed_at)}
                            </div>
                            {!isCreation && (
                              <>
                                {h.user && (
                                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                                    Par: {h.user.full_name}
                                  </div>
                                )}
                                {h.reason && (() => {
                                  const reason = (h.reason || "").toLowerCase();
                                  const isAssignmentBySecretary = reason.includes("assignation par secrétaire") ||
                                    reason.includes("assignation par adjoint") ||
                                    reason.includes("secrétaire/adjoint dsi");
                                  if (isAssignmentBySecretary) return null;
                                  return (
                                    <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                      {(() => {
                                        if (reason.includes("validation utilisateur: rejeté") && (h.reason || "").includes("Motif:")) {
                                          const motifMatch = (h.reason || "").match(/Motif:\s*(.+)/i);
                                          if (motifMatch && motifMatch[1]) return `Motif: ${motifMatch[1].trim()}`;
                                        }
                                        return h.reason;
                                      })()}
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Actions disponibles */}
              <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                <strong>Actions :</strong>
                <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(() => {
                    const isAssigned = ticketDetails.technician !== null && ticketDetails.technician !== undefined;
                    const blockedStatuses = ["assigne_technicien", "en_cours", "cloture", "resolu", "rejete"];
                    const isBlocked = blockedStatuses.includes(ticketDetails.status) || isAssigned;
                    const noActionsAvailable = isBlocked && ticketDetails.status !== "resolu";
                    if (noActionsAvailable) {
                      return <span style={{ fontStyle: "italic" }}>Aucune action disponible pour ce ticket</span>;
                    }
                    if (ticketDetails.status === "resolu") {
                      return null;
                    }
                    return (
                      <>
                        <button
                          onClick={() => openEditModal(ticketDetails)}
                          disabled={loading}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: "#e5e7eb",
                            color: "black",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "500",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#d1d5db"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#e5e7eb"; }}
                        >
                          <Pencil size={16} />
                          Modifier
                        </button>
                        <button
                          onClick={() => {
                            if (loading) return;
                            setConfirmDeleteTicket(ticketDetails);
                          }}
                          disabled={loading}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: "#e5e7eb",
                            color: "red",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "500",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#d1d5db"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#e5e7eb"; }}
                        >
                          <Trash2 size={16} color="red" />
                          Supprimer
                        </button>
                      </>
                    );
                  })()}

                  {/* Boutons Valider/Rejeter si le ticket est résolu */}
                  {ticketDetails.status === "resolu" && (
                    <>
                      <button
                        onClick={() => {
                          setValidationTicket(ticketDetails.id);
                          setShowRejectionForm(false);
                          setRejectionReason("");
                        }}
                        disabled={loading}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#28a745",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#218838";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#28a745";
                        }}
                      >
                        Valider
                      </button>
                      <button
                        onClick={() => {
                          setValidationTicket(ticketDetails.id);
                          setShowRejectionForm(true);
                          setRejectionReason("");
                        }}
                        disabled={loading}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#e5e7eb",
                          color: "#dc3545",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#d1d5db";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#e5e7eb";
                        }}
                      >
                        <RefreshCcw size={16} color="#dc3545" />
                        Relancer
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* Section Tickets - Style GLPI - Visible seulement sur Dashboard */}
          {activeSection === "dashboard" && (
            <div style={{ 
              background: "transparent", 
              borderRadius: "0", 
              boxShadow: "none", 
              padding: "0",
              marginBottom: "30px"
            }}>
            {/* Header retiré */}

            {/* Message d'accueil */}
            <div style={{ marginTop: "40px", marginBottom: "30px" }}>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>
                Bonjour, {userInfo?.full_name ? userInfo.full_name.split(' ')[0] : 'Jean'} 👋
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
                  minHeight: "100px",
                  overflow: "hidden"
                }}
                onMouseEnter={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1.5)";
                }}
                onMouseLeave={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1)";
                }}
              >
                {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
                <div 
                  className="kpi-badge-user"
                  style={{
                    position: "absolute",
                    right: "-16px",
                    top: "-16px",
                    width: "96px",
                    height: "96px",
                    borderRadius: "50%",
                    background: "#ea580c",
                    opacity: 0.05,
                    zIndex: 0,
                    transition: "transform 500ms ease"
                  }}
                ></div>

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
                    justifyContent: "center",
                    zIndex: 1,
                    position: "relative"
                  }}>
                    <Clock size={16} color="#ea580c" />
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "11px", fontWeight: "500" }}>
                    En attente
                  </div>
                </div>
                <span style={{ fontSize: "28px", fontWeight: "bold", color: "#1f2937", marginBottom: "4px", zIndex: 1, position: "relative" }}>
                  {statusCounts.en_attente_analyse}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "500", color: "#4b5563", zIndex: 1, position: "relative" }}>En attente d'assignation</span>
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
                  minHeight: "100px",
                  overflow: "hidden"
                }}
                onMouseEnter={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1.5)";
                }}
                onMouseLeave={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1)";
                }}
              >
                {/* Cercle décoratif bleu en arrière-plan - coin supérieur droit */}
                <div 
                  className="kpi-badge-user"
                  style={{
                    position: "absolute",
                    right: "-16px",
                    top: "-16px",
                    width: "96px",
                    height: "96px",
                    borderRadius: "50%",
                    background: "#ea580c",
                    opacity: 0.05,
                    zIndex: 0,
                    transition: "transform 500ms ease"
                  }}
                ></div>

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
                  minHeight: "100px",
                  overflow: "hidden"
                }}
                onMouseEnter={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1.5)";
                }}
                onMouseLeave={(e) => {
                  const badge = e.currentTarget.querySelector('.kpi-badge-user') as HTMLElement;
                  if (badge) badge.style.transform = "scale(1)";
                }}
              >
                {/* Cercle décoratif vert en arrière-plan - coin supérieur droit */}
                <div 
                  className="kpi-badge-user"
                  style={{
                    position: "absolute",
                    right: "-16px",
                    top: "-16px",
                    width: "96px",
                    height: "96px",
                    borderRadius: "50%",
                    background: "#ea580c",
                    opacity: 0.05,
                    zIndex: 0,
                    transition: "transform 500ms ease"
                  }}
                ></div>

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
                    navigate("/dashboard/user");
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
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b", fontWeight: "600" }}>{formatTicketNumber(t.number)}</td>
                        <td style={{ padding: "12px", fontSize: "14px", color: "#1e293b" }}>{t.title}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{
                            padding: t.status === "en_cours" ? "2px 10px" : "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: t.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : t.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : t.status === "en_cours" ? "rgba(15, 31, 61, 0.1)" : t.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : t.status === "rejete" ? "#fee2e2" : "#e5e7eb",
                            color: t.status === "en_attente_analyse" ? "#0DADDB" : t.status === "assigne_technicien" ? "#FF7A1B" : t.status === "en_cours" ? "#0F1F3D" : t.status === "resolu" ? "#2F9E44" : t.status === "rejete" ? "#991b1b" : "#374151",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px"
                          }}>
                            {t.status === "en_attente_analyse" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0DADDB" }}></div>}
                            {t.status === "assigne_technicien" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "2px solid #FF7A1B" }}></div>}
                            {t.status === "en_cours" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#0F1F3D" }}></div>}
                            {t.status === "resolu" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "2px solid #6b7280" }}></div>}
                            {t.status === "rejete" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }}></div>}
                            {t.status === "cloture" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6b7280" }}></div>}
                            {t.status === "en_attente_analyse" ? "En attente d'assignation" :
                             t.status === "assigne_technicien" ? "Assigné au technicien" :
                             t.status === "en_cours" ? "En cours" :
                             t.status === "resolu" ? "Résolu" :
                             t.status === "rejete" ? "Relancé" :
                             t.status === "cloture" ? "Clôturé" : t.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          {t.priority ? (
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "500",
                              background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                              color: t.priority === "critique" ? "#E53E3E" : t.priority === "haute" ? "#F59E0B" : t.priority === "moyenne" ? "#0DADDB" : t.priority === "faible" ? "#6B7280" : "#374151"
                            }}>
                              {getPriorityLabel(t.priority)}
                            </span>
                          ) : "—"}
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
            {activeSection === "dashboard" && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "32px", marginBottom: "20px" }}>
                <h3 style={{ fontSize: "22px", fontWeight: "700", color: "#111827" }}>
                  Tickets Récents
                </h3>
              </div>
            )}
            {activeSection === "tickets" && (
              <div style={{ 
                display: "flex", 
                flexDirection: "column",
                gap: "12px", 
                marginTop: "20px",
                marginBottom: "20px"
              }}>
                {/* Barre de recherche */}
                <div style={{ 
                  position: "relative", 
                  display: "flex", 
                  alignItems: "center" 
                }}>
                  <Search 
                    size={16} 
                    style={{ 
                      position: "absolute", 
                      left: "16px", 
                      color: "#6b7280",
                      pointerEvents: "none"
                    }} 
                  />
                  <input
                    type="text"
                    placeholder="Rechercher par ID, titre, description..."
                    value={dashboardSearch}
                    onChange={(e) => setDashboardSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 40px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "transparent",
                      outline: "none",
                      color: "#1f2937"
                    }}
                  />
                </div>
                {/* Filtres */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px"
                }}>
                  <select
                    value={dashboardStatusFilter}
                    onChange={(e) => setDashboardStatusFilter(e.target.value)}
                    style={{ 
                      padding: "10px 12px", 
                      border: "1px solid #d1d5db", 
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "transparent",
                      minWidth: "160px"
                    }}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="en_attente_analyse">En attente d'assignation</option>
                    <option value="assigne_technicien">Assigné au technicien</option>
                    <option value="en_cours">En cours</option>
                    <option value="resolu">Résolu</option>
                    <option value="rejete">Relancé</option>
                    <option value="cloture">Clôturé</option>
                  </select>
                  <select
                    value={dashboardCategoryFilter}
                    onChange={(e) => setDashboardCategoryFilter(e.target.value)}
                    style={{ 
                      padding: "10px 12px", 
                      border: "1px solid #d1d5db", 
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "transparent",
                      minWidth: "140px"
                    }}
                  >
                    <option value="">Tous types</option>
                    <option value="materiel">Matériel</option>
                    <option value="applicatif">Applicatif</option>
                  </select>
                  <select
                    value={dashboardPriorityFilter}
                    onChange={(e) => setDashboardPriorityFilter(e.target.value)}
                    style={{ 
                      padding: "10px 12px", 
                      border: "1px solid #d1d5db", 
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "transparent",
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
              </div>
            )}
            {/* Compteur de tickets avec icône */}
            {activeSection === "tickets" && (() => {
              const filteredTickets = tickets.filter((t) => {
                const search = dashboardSearch.trim().toLowerCase();
                const formattedNumber = formatTicketNumber(t.number).toLowerCase();
                const matchesSearch = !search || 
                  formattedNumber.includes(search) ||
                  t.number.toString().includes(search) ||
                  t.title.toLowerCase().includes(search) ||
                  (t.description || "").toLowerCase().includes(search);
                const matchesStatus = !dashboardStatusFilter || t.status === dashboardStatusFilter;
                const matchesCategory = !dashboardCategoryFilter || (() => {
                  const category = (t.category || "").toLowerCase();
                  const isApplicatif = category.includes("logiciel") || 
                                      category.includes("applicatif") ||
                                      category.includes("application");
                  const categoryType = isApplicatif ? "applicatif" : "materiel";
                  return categoryType === dashboardCategoryFilter.toLowerCase();
                })();
                const matchesPriority = !dashboardPriorityFilter || t.priority === dashboardPriorityFilter;
                return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
              });
              const ticketCount = filteredTickets.length;
              
              return (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px",
                  marginBottom: "16px"
                }}>
                  <Ticket size={20} color="#4b5563" />
                  <span style={{ 
                    fontSize: "14px", 
                    fontWeight: "500", 
                    color: "#4b5563"
                  }}>
                    {ticketCount} ticket(s) trouvé(s)
                  </span>
                </div>
              );
            })()}
            {/* Tickets Cards */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                // Important : laisser les menus d'actions dépasser (pour voir "Supprimer" en bas de la liste)
                overflow: "visible",
              }}
            >
              {tickets.length === 0 ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "40px", 
                  color: "#999", 
                  fontWeight: "500",
                  background: "white",
                  borderRadius: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}>
                    Aucun ticket créé
                </div>
              ) : (
                (activeSection === "dashboard" || activeSection === "tickets"
                  ? tickets.filter((t) => {
                    const search = dashboardSearch.trim().toLowerCase();
                    const formattedNumber = formatTicketNumber(t.number).toLowerCase();
                    const matchesSearch = !search || 
                      formattedNumber.includes(search) ||
                      t.number.toString().includes(search) ||
                      t.title.toLowerCase().includes(search) ||
                      (t.description || "").toLowerCase().includes(search);
                    const matchesStatus = !dashboardStatusFilter || t.status === dashboardStatusFilter;
                    const matchesCategory = !dashboardCategoryFilter || (() => {
                      const category = (t.category || "").toLowerCase();
                      const isApplicatif = category.includes("logiciel") || 
                                          category.includes("applicatif") ||
                                          category.includes("application");
                      const categoryType = isApplicatif ? "applicatif" : "materiel";
                      return categoryType === dashboardCategoryFilter.toLowerCase();
                    })();
                    const matchesPriority = !dashboardPriorityFilter || t.priority === dashboardPriorityFilter;
                    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
                  })
                  : tickets)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, activeSection === "dashboard" ? 5 : tickets.length)
                  .map((t) => {
                    // Fonction helper pour calculer la date relative
                    const getRelativeTime = (date: string) => {
                      const now = new Date();
                      const past = new Date(date);
                      const diffInMs = now.getTime() - past.getTime();
                      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
                      
                      if (diffInDays === 0) return "aujourd'hui";
                      if (diffInDays === 1) return "il y a 1 jour";
                      return `il y a ${diffInDays} jours`;
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

                    // Couleur de la barre selon la priorité (neutre si priorité non encore définie par DSI/Adjoint)
                    const borderColor = !t.priority ? "rgba(107, 114, 128, 0.3)" :
                                       t.priority === "critique" ? "#E53E3E" : 
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
                              padding: t.status === "en_cours" ? "2px 10px" : "3px 8px",
                              borderRadius: "20px",
                              fontSize: t.status === "en_cours" ? "12px" : "10px",
                              fontWeight: "500",
                        background: t.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : t.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : t.status === "en_cours" ? "rgba(15, 31, 61, 0.1)" : t.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : t.status === "rejete" ? "#fee2e2" : t.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                        color: t.status === "en_attente_analyse" ? "#0DADDB" : t.status === "assigne_technicien" ? "#FF7A1B" : t.status === "en_cours" ? "#0F1F3D" : t.status === "resolu" ? "#2F9E44" : t.status === "rejete" ? "#991b1b" : t.status === "cloture" ? "#374151" : "#374151",
                        whiteSpace: "nowrap",
                      }}>
                        {t.status === "en_attente_analyse" ? "En attente d'assignation" :
                         t.status === "assigne_technicien" ? "Assigné au technicien" :
                         t.status === "en_cours" ? "En cours" :
                         t.status === "resolu" ? "Résolu" :
                         t.status === "rejete" ? "Relancé" :
                         t.status === "cloture" ? "Clôturé" : t.status}
                      </span>

                            {/* Badge Priorité (affiché uniquement quand définie par DSI/Adjoint) */}
                            {t.priority && (
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
                            )}

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
                          <div
                            ref={openActionsMenuFor === t.id ? actionsMenuContainerRef : undefined}
                            style={{ position: "relative" }}
                          >
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
                                      const menuHeight = 150;
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

                        {/* Pied de carte : Créateur, Date, Assigné + Actions spéciales */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {/* Avatar + Nom créateur */}
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
                                {getInitials(t.creator?.full_name || "Inconnu")}
                              </div>
                              <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                {t.creator?.full_name || "Inconnu"}
                              </span>
                            </div>

                            {/* Date relative */}
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <Clock size={12} color="#9ca3af" />
                              <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                {getRelativeTime(t.created_at)}
                              </span>
                            </div>

                            {/* Flèche + Assigné (si existe) */}
                            {t.technician && (
                              <>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>→</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <div style={{
                                    width: "20px",
                                    height: "20px",
                                    borderRadius: "50%",
                                    background: "rgba(255, 122, 27, 0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    color: "#FF7A1B",
                                  }}>
                                    {getInitials(t.technician.full_name)}
                                  </div>
                                  <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                    {t.technician.full_name}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Actions spéciales - Avis donné seulement */}
                          <div>
                        {t.status === "cloture" && t.feedback_score ? (
                          <span style={{ color: "#28a745", fontSize: "12px" }}>
                            ✓ Avis donné ({t.feedback_score}/5)
                          </span>
                        ) : null}
                      </div>
                        </div>
                      </div>
                    );
                  })
              )}
        </div>
        </div>
      )}
          </>
        )}

      {/* Section Notifications dans le contenu principal */}
      {activeSection === "notifications" && !showTicketDetailsPage && (
        <div style={{
          display: "flex",
          width: "100%",
          height: "calc(100vh - 80px)",
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
              padding: "28px 20px 20px 0",
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
            </div>
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 10px 10px 0"
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
                            await markTicketNotificationsAsRead(ticket.id);
                          }
                        } catch (err) {
                          console.error("Erreur chargement détails:", err);
                        }
                      }}
                      style={{
                        padding: "12px 12px 12px 0",
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
                            {formatTicketNumber(ticket.number)}
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
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails du ticket {formatTicketNumber(selectedNotificationTicketDetails.number)}</h3>
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
                        Relancé
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
                    {selectedNotificationTicketDetails.priority != null && selectedNotificationTicketDetails.priority !== "" && (
                      <div>
                        <strong>Priorité :</strong>
                        <span style={{
                          marginLeft: "8px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "500",
                          background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : selectedNotificationTicketDetails.priority === "faible" ? "#E5E7EB" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "critique" ? "#E53E3E" : selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : selectedNotificationTicketDetails.priority === "moyenne" ? "#0DADDB" : selectedNotificationTicketDetails.priority === "faible" ? "#6B7280" : "white"
                        }}>
                          {getPriorityLabel(selectedNotificationTicketDetails.priority)}
                        </span>
                      </div>
                    )}
                    <div>
                      <strong>Statut :</strong>
                      <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                        {selectedNotificationTicketDetails.status}
                      </span>
                    </div>
                    {selectedNotificationTicketDetails.category && (
                      <div>
                        <strong>Catégorie :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
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
                      {(() => {
                        const displayHistory = getDisplayHistory(selectedNotificationTicketDetails, ticketHistory);
                        if (displayHistory.length === 0) {
                          return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                        }
                        return displayHistory.map((h, index) => {
                          const { Icon, iconBg, iconBorder, iconColor } = getHistoryVisuals(h);
                          const isLast = index === displayHistory.length - 1;
                          const isCreation = h.new_status === "creation";
                          return (
                            <div key={h.id} style={{ display: "flex", gap: "12px" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "60px" }}>
                                <div
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "9999px",
                                    border: `2px solid ${iconBorder}`,
                                    backgroundColor: iconBg,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: iconColor,
                                    boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.15)",
                                  }}
                                >
                                  <Icon size={18} />
                                </div>
                                {!isLast && (
                                  <div
                                    style={{
                                      flexGrow: 1,
                                      width: "2px",
                                      backgroundColor: "#E5E7EB",
                                      marginTop: "4px",
                                      marginBottom: "-4px",
                                    }}
                                  />
                                )}
                              </div>
                              <div
                                style={{
                                  padding: "8px 12px",
                                  marginBottom: "12px",
                                  background: "#F9FAFB",
                                  borderRadius: "8px",
                                  border: "1px solid #E5E7EB",
                                  flex: 1,
                                }}
                              >
                                <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                                  {getHistoryTitle(h, selectedNotificationTicketDetails, displayHistory)}
                                </div>
                                <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                                  {formatHistoryDate(h.changed_at)}
                                </div>
                                {!isCreation && (
                                  <>
                                    {h.user && (
                                      <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                                        Par: {h.user.full_name}
                                      </div>
                                    )}
                                    {h.reason && (
                                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                        {h.reason}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
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
                <button type="submit" style={{ flex: 1, padding: "8px 16px", backgroundColor: "#FB7E06", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>Enregistrer</button>
                <button type="button" onClick={() => { setShowEditModal(false); setEditTicketId(null); }} style={{ flex: 1, padding: "8px 16px", backgroundColor: "white", color: "black", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>Annuler</button>
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
              {ticketDetails.priority != null && ticketDetails.priority !== "" && (
                <div>
                  <strong>Priorité :</strong>
                  <span style={{
                    marginLeft: "8px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: "500",
                    background: ticketDetails.priority === "critique" ? "#f44336" : ticketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : ticketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                    color: ticketDetails.priority === "haute" ? "#F59E0B" : "white"
                  }}>
                    {getPriorityLabel(ticketDetails.priority)}
                  </span>
                </div>
              )}
              <div>
                <strong>Catégorie :</strong>
                <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
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
                {(() => {
                  const displayHistory = getDisplayHistory(ticketDetails, ticketHistory);
                  if (displayHistory.length === 0) {
                    return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                  }
                  return displayHistory.map((h, index) => {
                    const { Icon, iconBg, iconBorder, iconColor } = getHistoryVisuals(h);
                    const isLast = index === displayHistory.length - 1;
                    const isCreation = h.new_status === "creation";
                    return (
                      <div key={h.id} style={{ display: "flex", gap: "12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "60px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "9999px",
                              border: `2px solid ${iconBorder}`,
                              backgroundColor: iconBg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: iconColor,
                              boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.15)",
                            }}
                          >
                            <Icon size={18} />
                          </div>
                          {!isLast && (
                            <div
                              style={{
                                flexGrow: 1,
                                width: "2px",
                                backgroundColor: "#E5E7EB",
                                marginTop: "4px",
                                marginBottom: "-4px",
                              }}
                            />
                          )}
                        </div>
                        <div
                          style={{
                            padding: "8px 12px",
                            marginBottom: "24px",
                            background: "#F9FAFB",
                            borderRadius: "8px",
                            border: "1px solid #E5E7EB",
                            flex: 1,
                          }}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                            {getHistoryTitle(h, ticketDetails, displayHistory)}
                          </div>
                          <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                            {formatHistoryDate(h.changed_at)}
                          </div>
                          {!isCreation && (
                            <>
                              {h.user && (
                                <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                                  Par: {h.user.full_name}
                                </div>
                              )}
                              {h.reason && (
                                <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                  {h.reason}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
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
        <div style={{ marginBottom: "16px", padding: "10px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", fontSize: "14px", color: "#0c4a6e" }}>
          Note : La priorité du ticket sera définie par l'équipe DSI lors de l'assignation
        </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                  <button 
                    type="submit" 
                    disabled={loading || !title.trim() || !description.trim()} 
                    style={{
                      flex: 1,
                      padding: "12px 20px",
                      backgroundColor: "#FB7E06",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "500",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      transition: "opacity 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      if (!loading && title.trim() && description.trim()) {
                        e.currentTarget.style.opacity = "0.9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    <Send size={16} style={{ color: "white" }} />
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
                Cette action supprimera définitivement le ticket {formatTicketNumber(confirmDeleteTicket.number)}. 
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
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#F58220",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "6px 8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <CheckCircle2 size={18} />
                      Tout marquer comme lu
                    </button>
                  )}
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
                            {formatNotificationMessage(notif.message)}
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
                  padding: "28px 20px 20px 0",
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
                  padding: "10px 10px 10px 0"
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
                                await markTicketNotificationsAsRead(ticket.id);
                              }
                            } catch (err) {
                              console.error("Erreur chargement détails:", err);
                            }
                          }}
                          style={{
                            padding: "12px 12px 12px 0",
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
                            Relancé
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
                        {selectedNotificationTicketDetails.priority != null && selectedNotificationTicketDetails.priority !== "" && (
                          <div>
                            <strong>Priorité :</strong>
                            <span style={{
                              marginLeft: "8px",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "500",
                              background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                              color: selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : "white"
                            }}>
                              {getPriorityLabel(selectedNotificationTicketDetails.priority)}
                            </span>
                          </div>
                        )}
                        <div>
                          <strong>Statut :</strong>
                          <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                            {selectedNotificationTicketDetails.status}
                          </span>
                        </div>
                        {selectedNotificationTicketDetails.category && (
                          <div>
                            <strong>Catégorie :</strong>
                            <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
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
                          {(() => {
                            const displayHistory = getDisplayHistory(selectedNotificationTicketDetails, ticketHistory);
                            if (displayHistory.length === 0) {
                              return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                            }
                            return displayHistory.map((h, index) => {
                              const { Icon, iconBg, iconBorder, iconColor } = getHistoryVisuals(h);
                              const isLast = index === displayHistory.length - 1;
                              const isCreation = h.new_status === "creation";
                              return (
                                <div key={h.id} style={{ display: "flex", gap: "12px" }}>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "60px" }}>
                                    <div
                                      style={{
                                        width: "32px",
                                        height: "32px",
                                        borderRadius: "9999px",
                                        border: `2px solid ${iconBorder}`,
                                        backgroundColor: iconBg,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: iconColor,
                                        boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.15)",
                                      }}
                                    >
                                      <Icon size={18} />
                                    </div>
                                    {!isLast && (
                                      <div
                                        style={{
                                          flexGrow: 1,
                                          width: "2px",
                                          backgroundColor: "#E5E7EB",
                                          marginTop: "4px",
                                          marginBottom: "-4px",
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      padding: "8px 12px",
                                      marginBottom: "24px",
                                      background: "#F9FAFB",
                                      borderRadius: "8px",
                                      border: "1px solid #E5E7EB",
                                      flex: 1,
                                    }}
                                  >
                                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                                      {getHistoryTitle(h, selectedNotificationTicketDetails, displayHistory)}
                                    </div>
                                    <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                                      {formatHistoryDate(h.changed_at)}
                                    </div>
                                    {!isCreation && (
                                      <>
                                        {h.user && (
                                          <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                                            Par: {h.user.full_name}
                                          </div>
                                        )}
                                        {h.reason && (
                                          <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                            {h.reason}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
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
