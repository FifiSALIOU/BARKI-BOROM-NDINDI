import { useEffect, useState, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Users, Clock3, TrendingUp, Award, UserCheck, Star, LayoutDashboard, ChevronLeft, ChevronRight, Bell, BarChart3, Search, Ticket, Wrench, CheckCircle2, AlertTriangle, Clock, Briefcase, UserPlus, CornerUpRight, Box } from "lucide-react";
import React from "react";
import helpdeskLogo from "../assets/helpdesk-logo.png";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LabelList
} from "recharts";

interface DSIDashboardProps {
  token: string;
}

interface Ticket {
  id: string;
  number: number;
  title: string;
  description?: string;
  creator_id: string;
  creator?: {
    full_name: string;
    email: string;
    agency: string | null;
  };
  user_agency: string | null;
  priority: string;
  status: string;
  type?: string;
  category?: string | null;
  technician_id: string | null;
  technician?: {
    full_name: string;
  };
  secretary_id?: string | null;  // ID de l'adjoint DSI auquel le ticket est délégué
  created_at?: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  feedback_score?: number | null;
}

interface Technician {
  id: string;
  full_name: string;
  email: string;
  specialization?: string | null;
  assigned_tickets_count?: number;
  in_progress_tickets_count?: number;
  agency?: string | null;
  phone?: string | null;
  resolved_tickets_count?: number;
  closed_tickets_count?: number;
  resolved_this_month?: number;
  resolved_today?: number;
  avg_resolution_time_days?: number;
  avg_response_time_minutes?: number;
  actif?: boolean;
  last_login_at?: string | null;
  success_rate?: number;
  workload_ratio?: string;
  is_available?: boolean;
  max_tickets_capacity?: number | null;
  notes?: string | null;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  ticket_id?: string | null;
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

interface UserRead {
  id?: string;  // ID de l'utilisateur connecté
  full_name: string;
  email: string;
  agency?: string | null;
  role?: {
    name: string;
  } | null;
}

// Composant Label personnalisé pour les donut charts avec labels externes et lignes de connexion
const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, fill, value }: any) => {
  // Ne pas afficher le label si la valeur est 0 ou le pourcentage est 0%
  if (value === 0 || percent === 0 || Math.round(percent * 100) === 0) {
    return null;
  }
  
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  // Position externe pour le label (outerRadius + 25px pour plus d'espace)
  const labelRadius = outerRadius + 25;
  const labelX = cx + labelRadius * Math.cos(-midAngle * RADIAN);
  const labelY = cy + labelRadius * Math.sin(-midAngle * RADIAN);
  
  // Point de connexion sur le bord externe
  const connectX = cx + outerRadius * Math.cos(-midAngle * RADIAN);
  const connectY = cy + outerRadius * Math.sin(-midAngle * RADIAN);
  
  return (
    <g>
      {/* Ligne de connexion */}
      <line
        x1={connectX}
        y1={connectY}
        x2={labelX}
        y2={labelY}
        stroke={fill}
        strokeWidth={1.5}
      />
      {/* Label externe */}
      <text
        x={labelX}
        y={labelY}
        fill={fill}
        textAnchor={labelX > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize="12px"
        fontWeight="500"
      >
        {name} ({Math.round(percent * 100)}%)
      </text>
    </g>
  );
};

function DSIDashboard({ token }: DSIDashboardProps) {
  const [searchParams] = useSearchParams();
  
  // Fonction helper pour formater le numéro de ticket en "TKT-XXX"
  const formatTicketNumber = (number: number): string => {
    return `TKT-${number.toString().padStart(3, '0')}`;
  };
  
  // Fonction pour formater le message de notification en remplaçant #X par TKT-XXX
  const formatNotificationMessage = (message: string): string => {
    return message.replace(/#(\d+)/g, (match, number) => {
      return formatTicketNumber(parseInt(number, 10));
    });
  };
  
  // Déterminer le statut simple Actif / Inactif à partir de actif (Boolean)
  function getAvailabilityStatus(tech: Technician): string {
    // actif est maintenant un Boolean
    return tech.actif === true ? "actif" : "inactif";
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

  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  const [reopenTicketId, setReopenTicketId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [loadingRejectionReason, setLoadingRejectionReason] = useState<boolean>(false);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [showTicketDetailsPage, setShowTicketDetailsPage] = useState<boolean>(false);
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [showReassignModal, setShowReassignModal] = useState<boolean>(false);
  const [reassignTicketId, setReassignTicketId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignTicketId, setAssignTicketId] = useState<string | null>(null);
  const [showDelegateModal, setShowDelegateModal] = useState<boolean>(false);
  const [delegateTicketId, setDelegateTicketId] = useState<string | null>(null);
  const [selectedAdjoint, setSelectedAdjoint] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<{
    openTickets: number;
    avgResolutionTime: string | null;
    userSatisfaction: string | null;
  }>({
    openTickets: 0,
    avgResolutionTime: null,
    userSatisfaction: null,
  });
  const [techniciansSatisfaction, setTechniciansSatisfaction] = useState<string>("0.0");
  const [reopenedTicketsCount, setReopenedTicketsCount] = useState<number>(0);
  const [reopeningCalculated, setReopeningCalculated] = useState<boolean>(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Déterminer activeSection depuis l'URL
  const getActiveSection = () => {
    if (location.pathname === "/dashboard/dsi/notifications") return "notifications";
    if (location.pathname === "/dashboard/dsi/audit-logs") return "audit-logs";
    if (location.pathname === "/dashboard/dsi/maintenance") return "maintenance";
    if (location.pathname === "/dashboard/dsi/reports") return "reports";
    if (location.pathname === "/dashboard/dsi/users") return "users";
    if (location.pathname === "/dashboard/dsi/technicians") return "technicians";
    if (location.pathname === "/dashboard/dsi/actifs") return "actifs";
    if (location.pathname === "/dashboard/dsi/tickets") return "tickets";
    if (location.pathname === "/dashboard/dsi") return "dashboard";
    return "dashboard"; // Par défaut
  };
  const activeSection = getActiveSection();
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [delegationFilter, setDelegationFilter] = useState<string>("all");
  const [showReportsDropdown, setShowReportsDropdown] = useState<boolean>(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [openActionsMenuFor, setOpenActionsMenuFor] = useState<string | null>(null);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showNotificationsTicketsView, setShowNotificationsTicketsView] = useState<boolean>(false);
  const [notificationsTickets, setNotificationsTickets] = useState<Ticket[]>([]);
  const [selectedNotificationTicket, setSelectedNotificationTicket] = useState<string | null>(null);
  const [selectedNotificationTicketDetails, setSelectedNotificationTicketDetails] = useState<Ticket | null>(null);
  const [selectedNotificationTicketHistory, setSelectedNotificationTicketHistory] = useState<any[]>([]);
  const [userInfo, setUserInfo] = useState<UserRead | null>(null);
  const notificationsSectionRef = useRef<HTMLDivElement>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [delegatedTicketsByMe, setDelegatedTicketsByMe] = useState<Set<string>>(new Set());
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [userAgencyFilter, setUserAgencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [ticketSearchQuery, setTicketSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [usersPerPage] = useState<number>(10);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // États pour la section Techniciens
  const [techSearchQuery, setTechSearchQuery] = useState<string>("");
  const [techSpecializationFilter, setTechSpecializationFilter] = useState<string>("all");
  const [techAvailabilityFilter, setTechAvailabilityFilter] = useState<string>("all");
  const [selectedTechnicianDetails, setSelectedTechnicianDetails] = useState<Technician | null>(null);
  const [showTechnicianDetailsModal, setShowTechnicianDetailsModal] = useState<boolean>(false);
  const [, setLoadingTechnicianStats] = useState<boolean>(false);
  const [showCreateTechnicianModal, setShowCreateTechnicianModal] = useState<boolean>(false);
  const [showEditTechnicianModal, setShowEditTechnicianModal] = useState<boolean>(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [technicianToDelete, setTechnicianToDelete] = useState<Technician | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [showEditUserModal, setShowEditUserModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showGenerateReport, setShowGenerateReport] = useState<boolean>(false);
  const [reportType, setReportType] = useState<string>("");
  const [reportPeriodFrom, setReportPeriodFrom] = useState<string>("2024-01-01");
  const [reportPeriodTo, setReportPeriodTo] = useState<string>("2024-01-31");
  const [reportFilters, setReportFilters] = useState({
    department: "all",
    technician: "all",
    ticketType: "all",
    priority: "all"
  });
  const [showOutputFormat, setShowOutputFormat] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<string>("");
  
  // États pour les paramètres d'apparence
  const [appName, setAppName] = useState<string>(() => {
    return localStorage.getItem("appName") || "Système de Gestion des Tickets";
  });
  const [appTheme, setAppTheme] = useState<string>(() => {
    return localStorage.getItem("appTheme") || "clair";
  });
  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return localStorage.getItem("primaryColor") || "#007bff";
  });
  const [appLogo, setAppLogo] = useState<string | null>(() => {
    return localStorage.getItem("appLogo");
  });
  
  // États locaux pour la section Apparence
  const [localAppName, setLocalAppName] = useState(appName);
  const [localAppTheme, setLocalAppTheme] = useState(appTheme);
  const [localPrimaryColor, setLocalPrimaryColor] = useState(primaryColor);
  const [localAppLogo, setLocalAppLogo] = useState(appLogo);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // États pour les types de tickets
  const [ticketTypes, setTicketTypes] = useState<Array<{
    id: number;
    type: string;
    description: string;
    color: string;
  }>>(() => {
    const saved = localStorage.getItem("ticketTypes");
    if (saved) {
      return JSON.parse(saved);
    }
    // Types par défaut
    return [
      { id: 1, type: "Matériel", description: "Problèmes matériels", color: "#dc3545" },
      { id: 2, type: "Applicatif", description: "Problèmes logiciels", color: "#28a745" },
      { id: 3, type: "Réseau", description: "Problèmes réseau", color: "#ffc107" },
      { id: 4, type: "Accès", description: "Problèmes d'accès", color: "#9c27b0" },
      { id: 5, type: "Autre", description: "Autres problèmes", color: "#6c757d" }
    ];
  });
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<number | null>(null);
  const [newType, setNewType] = useState({ type: "", description: "", color: "#007bff" });
  
  // États pour les priorités
  const [priorities, setPriorities] = useState<Array<{
    id: number;
    priority: string;
    level: number;
    color: string;
    maxTime: string;
    maxTimeValue: number;
    maxTimeUnit: string;
  }>>(() => {
    const saved = localStorage.getItem("priorities");
    if (saved) {
      return JSON.parse(saved);
    }
    // Priorités par défaut
    return [
      { id: 1, priority: "Critique", level: 1, color: "#dc3545", maxTime: "1 heure", maxTimeValue: 1, maxTimeUnit: "heure" },
      { id: 2, priority: "Haute", level: 2, color: "rgba(245, 158, 11, 0.1)", maxTime: "4 heures", maxTimeValue: 4, maxTimeUnit: "heures" },
      { id: 3, priority: "Moyenne", level: 3, color: "#0DADDB", maxTime: "1 jour", maxTimeValue: 1, maxTimeUnit: "jour" },
      { id: 4, priority: "Basse", level: 4, color: "#28a745", maxTime: "3 jours", maxTimeValue: 3, maxTimeUnit: "jours" }
    ];
  });
  const [showAddPriorityModal, setShowAddPriorityModal] = useState(false);
  const [editingPriority, setEditingPriority] = useState<number | null>(null);
  const [newPriority, setNewPriority] = useState({ 
    priority: "", 
    level: 1, 
    color: "#dc3545", 
    maxTimeValue: 1, 
    maxTimeUnit: "heure" 
  });
  
  // États pour les paramètres SMTP/Email
  const [emailSettings, setEmailSettings] = useState(() => {
    const saved = localStorage.getItem("emailSettings");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      provider: "gmail",
      senderEmail: "tickets@entreprise.com",
      displayName: "Système de Gestion des Tickets",
      smtpServer: "smtp.gmail.com",
      smtpPort: "587",
      authType: "password",
      smtpUsername: "tickets@entreprise.com",
      smtpPassword: "",
      useTLS: true,
      verifySSL: true
    };
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [emailSubSection, setEmailSubSection] = useState<string>("smtp");
  
  // États pour les templates email
  const [emailTemplates, setEmailTemplates] = useState<Array<{
    id: number;
    name: string;
    active: boolean;
  }>>(() => {
    const saved = localStorage.getItem("emailTemplates");
    if (saved) {
      return JSON.parse(saved);
    }
    return [
      { id: 1, name: "Confirmation de Création de Ticket", active: true },
      { id: 2, name: "Assignation de Ticket", active: true },
      { id: 3, name: "Ticket Résolu", active: true },
      { id: 4, name: "Demande de Validation", active: true },
      { id: 5, name: "Ticket Clôturé", active: true },
      { id: 6, name: "Demande de Feedback", active: true },
      { id: 7, name: "Réinitialisation de Mot de Passe", active: true },
      { id: 8, name: "Bienvenue Nouvel Utilisateur", active: true },
      { id: 9, name: "Rapport Programmé", active: true },
      { id: 10, name: "Alerte Ticket Critique", active: true }
    ];
  });
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    recipients: "creator",
    customRecipients: "",
    active: true,
    content: ""
  });
  
  // États pour les notifications email
  const [emailNotifications, setEmailNotifications] = useState<Array<{
    event: string;
    active: boolean;
    recipients: string;
  }>>(() => {
    const saved = localStorage.getItem("emailNotifications");
    if (saved) {
      return JSON.parse(saved);
    }
    return [
      { event: "Nouveau Ticket Créé", active: true, recipients: "Secrétaire/Adjoint" },
      { event: "Ticket Assigné", active: true, recipients: "Technicien" },
      { event: "Ticket Réassigné", active: true, recipients: "Ancien + Nouveau Tech" },
      { event: "Ticket Résolu", active: true, recipients: "Utilisateur" },
      { event: "Ticket Relancé", active: true, recipients: "Technicien" },
      { event: "Ticket Clôturé", active: true, recipients: "Utilisateur" },
      { event: "Commentaire Ajouté", active: true, recipients: "Tous les Participants" },
      { event: "Ticket Escaladé", active: true, recipients: "DSI" },
      { event: "Ticket Critique en Attente", active: true, recipients: "DSI + Adjoint" },
      { event: "Rapport Généré", active: true, recipients: "Destinataires Rapport" },
      { event: "Alerte Système", active: true, recipients: "Admin + DSI" }
    ];
  });
  
  // États pour la fréquence d'envoi
  const [emailFrequency, setEmailFrequency] = useState(() => {
    const saved = localStorage.getItem("emailFrequency");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      frequency: "immediate",
      groupInterval: 30,
      dailyTime: "09:00",
      silenceFrom: "18:00",
      silenceTo: "09:00",
      applyWeekend: true
    };
  });
  
  // États pour le test email
  const [testEmail, setTestEmail] = useState({
    address: "admin@entreprise.com",
    template: ""
  });
  const [testResult, setTestResult] = useState<any>(null);
  
  // États pour les logs d'envoi
  const [emailLogs] = useState<Array<{
    id: number;
    date: string;
    recipient: string;
    template: string;
    status: "success" | "error";
    error?: string;
  }>>(() => {
    const saved = localStorage.getItem("emailLogs");
    if (saved) {
      return JSON.parse(saved);
    }
    return [
      { id: 1, date: "22/01 14:32:15", recipient: "admin@entreprise.com", template: "Confirmation", status: "success" },
      { id: 2, date: "22/01 14:15:42", recipient: "jean@entreprise.fr", template: "Assignation", status: "success" },
      { id: 3, date: "22/01 14:10:28", recipient: "marie@entreprise.com", template: "Résolution", status: "success" },
      { id: 4, date: "22/01 13:45:10", recipient: "pierre@entreprise.com", template: "Clôture", status: "success" },
      { id: 5, date: "22/01 13:30:55", recipient: "support@entreprise.com", template: "Alerte Critique", status: "error", error: "Serveur SMTP non disponible. Vérifiez les paramètres de connexion." }
    ];
  });
  
  // États pour les paramètres de sécurité
  const [securitySettings, setSecuritySettings] = useState(() => {
    const saved = localStorage.getItem("securitySettings");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      // Authentification
      mfaRequired: true,
      sessionTimeout: 30,
      connectionHistory: true,
      suspiciousConnectionAlerts: true,
      // Mot de Passe
      minPasswordLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      passwordExpiration: 90,
      // Audit et Logging
      recordAllActions: true,
      recordSensitiveDataChanges: true,
      recordFailedLogins: true,
      keepLogsFor: 90
    };
  });
  
  
  // Mettre à jour les états locaux quand on entre dans la section Apparence
  useEffect(() => {
    if (activeSection === "apparence") {
      setLocalAppName(appName);
      setLocalAppTheme(appTheme);
      setLocalPrimaryColor(primaryColor);
      setLocalAppLogo(appLogo);
    }
  }, [activeSection, appName, appTheme, primaryColor, appLogo]);
  
  // Gérer les paramètres URL pour ouvrir automatiquement les modals
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    const action = searchParams.get("action");
    
    if (ticketId && allTickets.length > 0) {
      // Vérifier que le ticket existe
      const ticket = allTickets.find(t => t.id === ticketId);
      if (ticket) {
        if (action === "assign") {
          setAssignTicketId(ticketId);
          setShowAssignModal(true);
          // Nettoyer l'URL après avoir ouvert le modal
          window.history.replaceState({}, "", window.location.pathname);
        } else if (action === "delegate") {
          setDelegateTicketId(ticketId);
          setShowDelegateModal(true);
          // Nettoyer l'URL après avoir ouvert le modal
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    }
  }, [searchParams, allTickets]);
  
  // Définir automatiquement "statistiques" comme rapport sélectionné quand on arrive sur la page reports
  useEffect(() => {
    if (location.pathname === "/dashboard/dsi/reports" && !selectedReport) {
      setSelectedReport("statistiques");
    }
  }, [location.pathname]);
  
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    phone: "",
    agency: "",
    role: "",
    actif: true,
    password: "",
    confirmPassword: "",
    generateRandomPassword: true,
    sendEmail: true,
    // Par défaut : 08h-13h / 14h-17h avec une heure de pause déjeuner
  });
  const [editUser, setEditUser] = useState({
    full_name: "",
    email: "",
    phone: "",
    agency: "",
    role: "",
    actif: true,
    // Par défaut : 08h-13h / 14h-17h avec une heure de pause déjeuner
  });

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    // Mapper les données de l'utilisateur au format du formulaire
    let roleName = "";
    if (user.role) {
      if (typeof user.role === "object" && user.role.name) {
        roleName = user.role.name;
      } else if (typeof user.role === "string") {
        roleName = user.role;
      }
    }
    
    // actif est maintenant un Boolean
    const actifValue = user.actif !== undefined ? user.actif : (user.is_active !== undefined ? user.is_active : true);
    
    setEditUser({
      full_name: user.full_name || user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      agency: user.agency || "",
      role: roleName,
      actif: actifValue,
    });
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !token) return;

    try {
      // Trouver le rôle_id correspondant au nom du rôle
      const roleMap: { [key: string]: string } = {
        "Utilisateur": "Utilisateur",
        "Technicien (Matériel)": "Technicien",
        "Technicien (Applicatif)": "Technicien",
        "Secrétaire DSI": "Secrétaire DSI",
        "Adjoint DSI": "Adjoint DSI",
        "DSI": "DSI",
        "Administrateur": "Admin"
      };

      // Charger les rôles pour obtenir les IDs
      const rolesRes = await fetch("http://localhost:8000/auth/roles", {
        headers: { Authorization: `Bearer ${token}` }
      });
      let roleId = null;
      if (rolesRes.ok) {
        const roles = await rolesRes.json();
        const roleName = roleMap[editUser.role] || editUser.role;
        const role = roles.find((r: any) => r.name === roleName);
        if (role) {
          roleId = role.id;
        }
      }

      // Préparer les données de mise à jour
      const updateData: any = {
        full_name: editUser.full_name,
        email: editUser.email,
        phone: editUser.phone || null,
        agency: editUser.agency,
        actif: editUser.actif
      };

      if (roleId) {
        updateData.role_id = roleId;
      }

      // Gérer la spécialisation pour les techniciens
      if (editUser.role === "Technicien (Matériel)") {
        updateData.specialization = "materiel";
      } else if (editUser.role === "Technicien (Applicatif)") {
        updateData.specialization = "applicatif";
      } else {
        updateData.specialization = null;
      }

      // Ajouter les informations spécifiques aux techniciens
      if (editUser.role === "Technicien (Matériel)" || editUser.role === "Technicien (Applicatif)") {
      }

      const res = await fetch(`http://localhost:8000/users/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        alert("Utilisateur modifié avec succès !");
        setShowEditUserModal(false);
        setEditingUser(null);
        // Recharger la liste des utilisateurs
        const usersRes = await fetch("http://localhost:8000/users/", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setAllUsers(usersData || []);
        }
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de modifier l'utilisateur"}`);
      }
    } catch (err) {
      console.error("Erreur lors de la modification:", err);
      alert("Erreur lors de la modification de l'utilisateur");
    }
  };

  const handleDeleteUser = async (user: any) => {
    if (!token) return;

    try {
      const res = await fetch(`http://localhost:8000/users/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        const result = await res.json();
        alert(result.message || "Utilisateur supprimé avec succès !");
        // Recharger la liste des utilisateurs
        const usersRes = await fetch("http://localhost:8000/users/", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setAllUsers(usersData || []);
        }
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de supprimer l'utilisateur"}`);
      }
    } catch (err) {
      console.error("Erreur lors de la suppression:", err);
      alert("Erreur lors de la suppression de l'utilisateur");
    }
  };

  const handleResetPassword = async (user: any) => {
    if (!token) return;

    try {
      const res = await fetch(`http://localhost:8000/users/${user.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Mot de passe réinitialisé avec succès !\nNouveau mot de passe: ${result.new_password}\n\nCopiez ce mot de passe et communiquez-le à l'utilisateur.`);
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de réinitialiser le mot de passe"}`);
      }
    } catch (err) {
      console.error("Erreur lors de la réinitialisation:", err);
      alert("Erreur lors de la réinitialisation du mot de passe");
    }
  };

  // Fonctions pour la section Apparence
  const handleSaveAppearance = () => {
    // Sauvegarder dans localStorage
    localStorage.setItem("appName", localAppName);
    localStorage.setItem("appTheme", localAppTheme);
    localStorage.setItem("primaryColor", localPrimaryColor);
    if (localAppLogo) {
      localStorage.setItem("appLogo", localAppLogo);
    } else {
      // Supprimer le logo de localStorage si localAppLogo est null
      localStorage.removeItem("appLogo");
    }
    
    // Mettre à jour les états globaux
    setAppName(localAppName);
    setAppTheme(localAppTheme);
    setPrimaryColor(localPrimaryColor);
    setAppLogo(localAppLogo);
    
    // Appliquer le thème
    if (localAppTheme === "sombre") {
      document.body.style.backgroundColor = "#1a1a1a";
      document.body.style.color = "#fff";
    } else if (localAppTheme === "clair") {
      document.body.style.backgroundColor = "#fff";
      document.body.style.color = "#333";
    } else {
      // Auto - utiliser les préférences du système
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.style.backgroundColor = prefersDark ? "#1a1a1a" : "#fff";
      document.body.style.color = prefersDark ? "#fff" : "#333";
    }
    
    alert("Paramètres d'apparence enregistrés avec succès !");
  };

  const handleCancelAppearance = () => {
    setLocalAppName(appName);
    setLocalAppTheme(appTheme);
    setLocalPrimaryColor(primaryColor);
    setLocalAppLogo(appLogo);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Vérifier la taille du fichier (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert("Le fichier est trop volumineux. Taille maximale : 2MB");
        // Réinitialiser l'input pour permettre de sélectionner un autre fichier
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      // Vérifier le format du fichier
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        alert("Format non accepté. Utilisez PNG ou JPG");
        // Réinitialiser l'input pour permettre de sélectionner un autre fichier
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      // Lire le fichier et le convertir en base64
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setLocalAppLogo(reader.result as string);
          // Afficher un message de succès
          alert("Logo téléchargé avec succès ! N'oubliez pas de cliquer sur 'Enregistrer' pour sauvegarder les modifications.");
        } else {
          alert("Erreur lors de la lecture du fichier. Veuillez réessayer.");
        }
        // Réinitialiser l'input pour permettre de télécharger le même fichier à nouveau si nécessaire
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      };
      reader.onerror = () => {
        alert("Erreur lors de la lecture du fichier. Veuillez réessayer.");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteLogo = () => {
    setLocalAppLogo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getColorName = (color: string) => {
    const colorMap: { [key: string]: string } = {
      "#007bff": "Bleu",
      "#28a745": "Vert",
      "#dc3545": "Rouge",
      "#ffc107": "Jaune",
      "#6c757d": "Gris",
      "#17a2b8": "Cyan",
      "#ff9800": "Orange",
      "#9c27b0": "Violet"
    };
    return colorMap[color] || "Personnalisé";
  };

  // Fonctions pour les types de tickets
  const handleAddType = () => {
    if (!newType.type.trim() || !newType.description.trim()) {
      alert("Veuillez remplir tous les champs");
      return;
    }
    const newId = ticketTypes.length > 0 ? Math.max(...ticketTypes.map(t => t.id)) + 1 : 1;
    const updatedTypes = [...ticketTypes, { ...newType, id: newId }];
    setTicketTypes(updatedTypes);
    localStorage.setItem("ticketTypes", JSON.stringify(updatedTypes));
    setNewType({ type: "", description: "", color: "#007bff" });
    setShowAddTypeModal(false);
    alert("Type de ticket ajouté avec succès !");
  };

  const handleEditType = (typeId: number) => {
    const type = ticketTypes.find(t => t.id === typeId);
    if (type) {
      setNewType({ type: type.type, description: type.description, color: type.color });
      setEditingType(typeId);
      setShowAddTypeModal(true);
    }
  };

  const handleUpdateType = () => {
    if (!newType.type.trim() || !newType.description.trim()) {
      alert("Veuillez remplir tous les champs");
      return;
    }
    const updatedTypes = ticketTypes.map(t => 
      t.id === editingType ? { ...t, ...newType } : t
    );
    setTicketTypes(updatedTypes);
    localStorage.setItem("ticketTypes", JSON.stringify(updatedTypes));
    setNewType({ type: "", description: "", color: "#007bff" });
    setEditingType(null);
    setShowAddTypeModal(false);
    alert("Type de ticket modifié avec succès !");
  };

  const handleDeleteType = (typeId: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce type de ticket ?")) {
      const updatedTypes = ticketTypes.filter(t => t.id !== typeId);
      setTicketTypes(updatedTypes);
      localStorage.setItem("ticketTypes", JSON.stringify(updatedTypes));
      alert("Type de ticket supprimé avec succès !");
    }
  };

  const getTypeColorName = (color: string) => {
    const colorMap: { [key: string]: string } = {
      "#dc3545": "Rouge",
      "#28a745": "Vert",
      "#ffc107": "Jaune",
      "#9c27b0": "Violet",
      "#6c757d": "Gris",
      "#007bff": "Bleu",
      "#17a2b8": "Cyan",
      "#ff9800": "Orange"
    };
    return colorMap[color] || "Personnalisé";
  };

  // Fonctions pour les priorités
  const handleAddPriority = () => {
    if (!newPriority.priority.trim()) {
      alert("Veuillez remplir tous les champs");
      return;
    }
    const maxTime = `${newPriority.maxTimeValue} ${newPriority.maxTimeUnit}`;
    const newId = priorities.length > 0 ? Math.max(...priorities.map(p => p.id)) + 1 : 1;
    const updatedPriorities = [...priorities, { 
      ...newPriority, 
      id: newId,
      maxTime 
    }];
    setPriorities(updatedPriorities);
    localStorage.setItem("priorities", JSON.stringify(updatedPriorities));
    setNewPriority({ priority: "", level: 1, color: "#dc3545", maxTimeValue: 1, maxTimeUnit: "heure" });
    setShowAddPriorityModal(false);
    alert("Priorité ajoutée avec succès !");
  };

  const handleEditPriority = (priorityId: number) => {
    const priority = priorities.find(p => p.id === priorityId);
    if (priority) {
      setNewPriority({ 
        priority: priority.priority, 
        level: priority.level, 
        color: priority.color, 
        maxTimeValue: priority.maxTimeValue, 
        maxTimeUnit: priority.maxTimeUnit 
      });
      setEditingPriority(priorityId);
      setShowAddPriorityModal(true);
    }
  };

  const handleUpdatePriority = () => {
    if (!newPriority.priority.trim()) {
      alert("Veuillez remplir tous les champs");
      return;
    }
    const maxTime = `${newPriority.maxTimeValue} ${newPriority.maxTimeUnit}`;
    const updatedPriorities = priorities.map(p => 
      p.id === editingPriority ? { ...p, ...newPriority, maxTime } : p
    );
    setPriorities(updatedPriorities);
    localStorage.setItem("priorities", JSON.stringify(updatedPriorities));
    setNewPriority({ priority: "", level: 1, color: "#dc3545", maxTimeValue: 1, maxTimeUnit: "heure" });
    setEditingPriority(null);
    setShowAddPriorityModal(false);
    alert("Priorité modifiée avec succès !");
  };

  const handleDeletePriority = (priorityId: number) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette priorité ?")) {
      const updatedPriorities = priorities.filter(p => p.id !== priorityId);
      setPriorities(updatedPriorities);
      localStorage.setItem("priorities", JSON.stringify(updatedPriorities));
      alert("Priorité supprimée avec succès !");
    }
  };

  const getPriorityColorName = (color: string) => {
    const colorMap: { [key: string]: string } = {
      "#dc3545": "Rouge",
      "#ff9800": "Orange",
      "#ffc107": "Jaune",
      "#28a745": "Vert",
      "#007bff": "Bleu",
      "#6c757d": "Gris",
      "#9c27b0": "Violet"
    };
    return colorMap[color] || "Personnalisé";
  };

  // Fonction pour sauvegarder les paramètres de sécurité
  const handleSaveSecurity = () => {
    localStorage.setItem("securitySettings", JSON.stringify(securitySettings));
    alert("Paramètres de sécurité enregistrés avec succès !");
  };

  const handleCancelSecurity = () => {
    const saved = localStorage.getItem("securitySettings");
    if (saved) {
      setSecuritySettings(JSON.parse(saved));
    }
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
          // Charger l'historique
          try {
            const res = await fetch(`http://localhost:8000/tickets/${selectedNotificationTicket}/history`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              setSelectedNotificationTicketHistory(Array.isArray(data) ? data : []);
            }
          } catch (err) {
            console.error("Erreur chargement historique:", err);
          }
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
              // Charger l'historique
              const historyRes = await fetch(`http://localhost:8000/tickets/${selectedNotificationTicket}/history`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
              if (historyRes.ok) {
                const historyData = await historyRes.json();
                setSelectedNotificationTicketHistory(Array.isArray(historyData) ? historyData : []);
              }
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
    navigate("/dashboard/dsi/notifications");
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

  // Appliquer le thème et la couleur primaire au chargement
  useEffect(() => {
    if (appTheme === "sombre") {
      document.body.style.backgroundColor = "#1a1a1a";
      document.body.style.color = "#fff";
    } else if (appTheme === "clair") {
      document.body.style.backgroundColor = "#fff";
      document.body.style.color = "#333";
    } else {
      // Auto - utiliser les préférences du système
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.style.backgroundColor = prefersDark ? "#1a1a1a" : "#fff";
      document.body.style.color = prefersDark ? "#fff" : "#333";
    }
  }, [appTheme]);

  // Fonction pour charger les tickets (séparée pour pouvoir être appelée périodiquement)
  async function loadTickets(searchTerm?: string) {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const url = new URL("http://localhost:8000/tickets/");
      if (searchTerm && searchTerm.trim() !== "") {
        url.searchParams.append("search", searchTerm.trim());
      }
      
      const ticketsRes = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      let ticketsData: Ticket[] = [];
      if (ticketsRes.ok) {
        ticketsData = await ticketsRes.json();
        setAllTickets(ticketsData);
        // Calculer les métriques
        const openCount = ticketsData.filter((t: Ticket) => 
          t.status !== "cloture" && t.status !== "resolu"
        ).length;
        setMetrics(prev => ({ ...prev, openTickets: openCount }));
      }
    } catch (err) {
      console.error("Erreur lors du chargement des tickets:", err);
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        // Charger les informations de l'utilisateur connecté en premier
        const meRes = await fetch("http://localhost:8000/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        let currentUserInfo: any = null;
        let currentUserRole: string = "";
        if (meRes.ok) {
          const meData = await meRes.json();
          currentUserInfo = {
            id: meData.id,
            full_name: meData.full_name,
            email: meData.email,
            agency: meData.agency,
            role: meData.role
          };
          setUserInfo(currentUserInfo);
          if (meData.role && meData.role.name) {
            currentUserRole = meData.role.name;
            setUserRole(currentUserRole);
            
            // Charger tous les utilisateurs (si Admin ou DSI)
            if (meData.role.name === "Admin" || meData.role.name === "DSI") {
              try {
                const usersRes = await fetch("http://localhost:8000/users/", {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                if (usersRes.ok) {
                  const usersData = await usersRes.json();
                  setAllUsers(usersData || []);
                } else {
                  console.error("Erreur chargement utilisateurs:", usersRes.status);
                  setAllUsers([]);
                }
              } catch (err) {
                console.error("Erreur chargement utilisateurs:", err);
                setAllUsers([]);
              }
            }
          }
        }

        // Charger tous les tickets
        await loadTickets();

        // Charger la liste des techniciens avec leurs stats
        const techRes = await fetch("http://localhost:8000/users/technicians", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (techRes.ok) {
          const techData = await techRes.json();
          // Charger les stats pour chaque technicien
          const techsWithStats = await Promise.all(
            techData.map(async (tech: any) => {
              try {
                const statsRes = await fetch(`http://localhost:8000/users/technicians/${tech.id}/stats`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
                if (statsRes.ok) {
                  const stats = await statsRes.json();
                  return { ...tech, ...stats };
                }
              } catch (err) {
                console.error(`Erreur stats pour ${tech.id}:`, err);
              }
              return { ...tech, workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
            })
          );
          setTechnicians(techsWithStats);
        }

        // Identifier les tickets délégués par le DSI connecté
        if (currentUserRole === "DSI" && currentUserInfo?.id && ticketsData && ticketsData.length > 0) {
          const delegatedTickets = ticketsData.filter((t: Ticket) => t.secretary_id !== null && t.secretary_id !== undefined);
          const ticketsDelegatedByMe = new Set<string>();
          
          // Vérifier l'historique de chaque ticket délégué pour voir s'il a été délégué par le DSI connecté
          for (const ticket of delegatedTickets) {
            try {
              const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (historyRes.ok) {
                const history: TicketHistory[] = await historyRes.json();
                // Chercher dans l'historique si le ticket a été délégué par le DSI connecté
                // On cherche une entrée d'historique où le user_id correspond au DSI connecté
                // et où il y a une mention de délégation (dans le reason) ou où le statut a été changé vers "en_attente_analyse" 
                // (car lors de la délégation, le statut est mis à "en_attente_analyse")
                // Comparer les IDs en tant que strings pour éviter les problèmes de type
                const dsiIdStr = String(currentUserInfo.id);
                
                // Chercher une entrée d'historique où le DSI connecté a délégué le ticket
                // Critères : user_id correspond au DSI connecté ET (raison contient mots-clés de délégation OU changement vers "en_attente_analyse")
                const delegationEntry = history.find((h: TicketHistory) => {
                  const userIdMatches = String(h.user_id) === dsiIdStr;
                  if (!userIdMatches) return false;
                  
                  // Vérifier si le reason contient des mots-clés de délégation
                  const reasonLower = (h.reason || "").toLowerCase();
                  const hasDelegationKeywords = reasonLower.includes("délégu") || 
                                                 reasonLower.includes("delegat") ||
                                                 reasonLower.includes("adjoint") ||
                                                 reasonLower.includes("délégation");
                  
                  // Vérifier si le statut a été changé vers "en_attente_analyse" (car lors de la délégation, le statut est mis à "en_attente_analyse")
                  const statusChangedToPending = h.new_status === "en_attente_analyse";
                  
                  // Si l'ancien statut n'était pas "en_attente_analyse", c'est plus probablement une délégation
                  const wasNotAlreadyPending = h.old_status !== "en_attente_analyse";
                  
                  // Un ticket est délégué si :
                  // 1. La raison contient des mots-clés de délégation, OU
                  // 2. Le DSI a mis le ticket en "en_attente_analyse" (et il n'était pas déjà en attente)
                  return hasDelegationKeywords || (statusChangedToPending && wasNotAlreadyPending);
                });
                
                if (delegationEntry) {
                  ticketsDelegatedByMe.add(ticket.id);
                } else {
                  // Fallback : si le ticket a un secretary_id et le DSI connecté a une entrée dans l'historique
                  // qui met le ticket en "en_attente_analyse", considérer comme délégation
                  const hasDSIEntryWithPendingStatus = history.some((h: TicketHistory) => 
                    String(h.user_id) === dsiIdStr && 
                    h.new_status === "en_attente_analyse"
                  );
                  
                  if (hasDSIEntryWithPendingStatus) {
                    ticketsDelegatedByMe.add(ticket.id);
                  }
                }
              } else {
                console.error(`Erreur HTTP lors du chargement de l'historique du ticket ${ticket.id}: ${historyRes.status}`);
              }
            } catch (err) {
              console.error(`Erreur lors du chargement de l'historique du ticket ${ticket.id}:`, err);
            }
          }
          setDelegatedTicketsByMe(ticketsDelegatedByMe);
          console.log(`Tickets délégués par le DSI connecté (${currentUserInfo.id}): ${ticketsDelegatedByMe.size} sur ${delegatedTickets.length} tickets avec secretary_id`);
        } else if (currentUserRole === "DSI" && currentUserInfo?.id) {
          // Si on n'a pas de tickets ou si currentUserInfo.id n'est pas défini, initialiser avec un Set vide
          setDelegatedTicketsByMe(new Set());
        }

        // Calculer les métriques à partir des tickets existants (après chargement)
        // Utiliser ticketsData directement au lieu de allTickets pour éviter le problème d'état asynchrone
        try {
          if (ticketsData && ticketsData.length > 0) {
            // Fonction pour calculer la satisfaction implicite basée sur les métriques
            const calculateImplicitSatisfaction = async (ticket: Ticket, history: TicketHistory[]): Promise<number> => {
              let score = 0;
              
              // 1. Temps de résolution (40% du score)
              if (ticket.created_at) {
                const created = new Date(ticket.created_at);
                let resolvedDate: Date | null = null;
                
                // Trouver la date de résolution - priorité : historique > resolved_at/closed_at > null
                const resolutionHistory = history.find(
                  h => h.new_status === "resolu" || h.new_status === "cloture"
                );
                if (resolutionHistory && resolutionHistory.changed_at) {
                  resolvedDate = new Date(resolutionHistory.changed_at);
                } else if (ticket.status === "cloture" && ticket.closed_at) {
                  resolvedDate = new Date(ticket.closed_at);
                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                  resolvedDate = new Date(ticket.resolved_at);
                }
                // Si aucune date disponible, on ne peut pas calculer ce critère (score = 0 pour cette partie)
                
                if (resolvedDate) {
                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                  const diffDays = diffHours / 24;
                  
                  let resolutionScore = 0;
                  if (ticket.priority === "haute" || ticket.priority === "critique") {
                    if (diffHours < 24) resolutionScore = 100;
                    else if (diffHours < 48) resolutionScore = 80;
                    else if (diffHours < 72) resolutionScore = 60;
                    else resolutionScore = 40;
                  } else if (ticket.priority === "moyenne") {
                    if (diffDays < 3) resolutionScore = 100;
                    else if (diffDays < 5) resolutionScore = 80;
                    else if (diffDays < 7) resolutionScore = 60;
                    else resolutionScore = 40;
                  } else {
                    if (diffDays < 7) resolutionScore = 100;
                    else if (diffDays < 14) resolutionScore = 80;
                    else if (diffDays < 21) resolutionScore = 60;
                    else resolutionScore = 40;
                  }
                  score += resolutionScore * 0.4;
                }
              }
              
              // 2. Absence de réouverture (30% du score)
              const reopenCount = history.filter(
                h => h.old_status === "cloture" || h.old_status === "resolu"
              ).length;
              if (reopenCount === 0) score += 100 * 0.3;
              else if (reopenCount === 1) score += 70 * 0.3;
              else score += 40 * 0.3;
              
              // 3. Absence d'escalade (20% du score) - Vérifier si le ticket a été assigné à un technicien puis réassigné
              const assignmentChanges = history.filter(
                h => h.new_status === "assigne_technicien" || h.new_status === "en_cours"
              ).length;
              if (assignmentChanges <= 1) score += 100 * 0.2;
              else if (assignmentChanges === 2) score += 50 * 0.2;
              else score += 20 * 0.2;
              
              // 4. Temps de réponse initial (10% du score)
              const firstResponse = history.find(
                h => h.new_status === "assigne_technicien" || h.new_status === "en_cours"
              );
              if (firstResponse && ticket.created_at) {
                const created = new Date(ticket.created_at);
                const firstResponseTime = new Date(firstResponse.changed_at);
                const responseHours = (firstResponseTime.getTime() - created.getTime()) / (1000 * 60 * 60);
                
                if (responseHours < 2) score += 100 * 0.1;
                else if (responseHours < 4) score += 80 * 0.1;
                else if (responseHours < 8) score += 60 * 0.1;
                else score += 40 * 0.1;
              } else {
                score += 60 * 0.1; // Score moyen si pas de réponse enregistrée
              }
              
              return Math.round(score);
            };
            
            // Fonction helper pour formater le temps en heures et minutes
            const formatTimeInHoursMinutes = (hoursDecimal: number): string => {
              if (hoursDecimal === 0) return "0 mn";
              
              // Afficher en heures et minutes
              const hours = Math.floor(hoursDecimal);
              const minutes = Math.floor((hoursDecimal - hours) * 60);
              if (hours === 0) {
                return `${minutes} mn`;
              } else if (minutes === 0) {
                return `${hours} h`;
              } else {
                return `${hours} h ${minutes} mn`;
              }
            };
            
            // Calculer le temps moyen de résolution réel
            const resolvedTickets = ticketsData.filter((t: Ticket) => t.status === "resolu" || t.status === "cloture");
            let totalResolutionTimeHours = 0;
            let resolvedCount = 0;
            
            // Tableau pour stocker les satisfactions calculées (tous les tickets)
            const satisfactionScores: number[] = [];
            // Tableau pour stocker les satisfactions calculées (uniquement tickets assignés aux techniciens)
            const techniciansSatisfactionScores: number[] = [];
            
            // Charger l'historique pour chaque ticket résolu pour obtenir la date de résolution
            await Promise.all(
              resolvedTickets.map(async (ticket: Ticket) => {
                if (!ticket.created_at) return;
                
                try {
                  const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                  
                  if (historyRes.ok) {
                    const history: TicketHistory[] = await historyRes.json();
                    // Trouver la date de résolution (première occurrence de "resolu" ou "cloture")
                    const resolutionHistory = history.find(
                      h => h.new_status === "resolu" || h.new_status === "cloture"
                    );
                    
                    // Trouver la date de résolution - priorité : historique > resolved_at/closed_at
                    let resolvedDate: Date | null = null;
                    if (resolutionHistory && resolutionHistory.changed_at) {
                      resolvedDate = new Date(resolutionHistory.changed_at);
                    } else if (ticket.status === "cloture" && ticket.closed_at) {
                      resolvedDate = new Date(ticket.closed_at);
                    } else if (ticket.status === "resolu" && ticket.resolved_at) {
                      resolvedDate = new Date(ticket.resolved_at);
                    }
                    
                    if (resolvedDate && ticket.created_at) {
                      const created = new Date(ticket.created_at);
                      const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                      if (diffHours >= 0) {
                        totalResolutionTimeHours += diffHours;
                        resolvedCount++;
                      }
                    }
                    // Si aucune date de résolution disponible, on exclut ce ticket du calcul du temps moyen
                    
                    // Calculer la satisfaction (hybride : feedback explicite si disponible, sinon implicite)
                    let score: number | null = null;
                    if (ticket.feedback_score !== null && ticket.feedback_score !== undefined && ticket.feedback_score > 0) {
                      // Utiliser le feedback explicite (convertir de 1-5 à pourcentage)
                      score = (ticket.feedback_score / 5) * 100;
                      satisfactionScores.push(score);
                    } else {
                      // Calculer la satisfaction implicite
                      score = await calculateImplicitSatisfaction(ticket, history);
                      satisfactionScores.push(score);
                    }
                    
                    // Si le ticket est assigné à un technicien, ajouter le score à la liste des techniciens
                    if (ticket.technician_id !== null && score !== null) {
                      techniciansSatisfactionScores.push(score);
                    }
                  }
                } catch (err) {
                  console.error(`Erreur historique ticket ${ticket.id}:`, err);
                  // En cas d'erreur, essayer d'utiliser resolved_at ou closed_at
                  if (ticket.created_at) {
                    let resolvedDate: Date | null = null;
                    if (ticket.status === "cloture" && ticket.closed_at) {
                      resolvedDate = new Date(ticket.closed_at);
                    } else if (ticket.status === "resolu" && ticket.resolved_at) {
                      resolvedDate = new Date(ticket.resolved_at);
                    }
                    
                    if (resolvedDate) {
                      const created = new Date(ticket.created_at);
                      const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                      if (diffHours >= 0) {
                        totalResolutionTimeHours += diffHours;
                        resolvedCount++;
                      }
                    }
                    // Si aucune date disponible, on exclut ce ticket du calcul
                  }
                  
                  // Score de satisfaction en cas d'erreur - seulement si on a un feedback explicite
                  if (ticket.feedback_score !== null && ticket.feedback_score !== undefined && ticket.feedback_score > 0) {
                    const score = (ticket.feedback_score / 5) * 100;
                    satisfactionScores.push(score);
                    // Si le ticket est assigné à un technicien, ajouter le score à la liste des techniciens
                    if (ticket.technician_id !== null) {
                      techniciansSatisfactionScores.push(score);
                    }
                  }
                  // Si pas de feedback et erreur, on n'ajoute pas de score (on ne peut pas calculer l'implicite sans historique)
                }
              })
            );
            
            // Note : La satisfaction est calculée uniquement pour les tickets résolus/clôturés
            // Les tickets non résolus ne sont pas inclus dans le calcul de satisfaction
            // car la satisfaction mesure la qualité du service rendu, qui n'est complète qu'après résolution
            
            const avgResolutionHours = resolvedCount > 0 ? totalResolutionTimeHours / resolvedCount : 0;
            const avgResolutionTimeFormatted = resolvedCount > 0 ? formatTimeInHoursMinutes(avgResolutionHours) : null;
            
            // Calculer la satisfaction moyenne (tous les tickets)
            let satisfactionPct: string | null = null;
            if (satisfactionScores.length > 0) {
              const avgSatisfaction = satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length;
              satisfactionPct = avgSatisfaction.toFixed(1);
            }
            
            // Calculer la satisfaction moyenne pour les techniciens (uniquement tickets assignés aux techniciens)
            let techniciansSatisfactionPct = "0.0";
            if (techniciansSatisfactionScores.length > 0) {
              const avgTechniciansSatisfaction = techniciansSatisfactionScores.reduce((sum, score) => sum + score, 0) / techniciansSatisfactionScores.length;
              techniciansSatisfactionPct = avgTechniciansSatisfaction.toFixed(1);
            }
            
            // Mettre à jour les métriques (en conservant openTickets déjà calculé)
            // Ne mettre à jour que si on a calculé de nouvelles valeurs valides
            setMetrics(prev => ({
              ...prev,
              avgResolutionTime: avgResolutionTimeFormatted ?? prev.avgResolutionTime,
              userSatisfaction: satisfactionPct !== null ? `${satisfactionPct}%` : prev.userSatisfaction,
            }));
            
            // Mettre à jour la satisfaction moyenne des techniciens
            setTechniciansSatisfaction(techniciansSatisfactionPct);
          } else {
            // Si aucun ticket, garder "Chargement..." ou les valeurs précédentes (ne pas mettre "0")
            setMetrics(prev => ({
              ...prev,
              avgResolutionTime: prev.avgResolutionTime ?? null,
              userSatisfaction: prev.userSatisfaction ?? null,
            }));
            // Ne pas modifier techniciansSatisfaction si on n'a pas de données
          }
        } catch (err) {
          console.log("Erreur calcul métriques:", err);
          // En cas d'erreur, garder les valeurs précédentes (ne pas mettre "0")
          setMetrics(prev => ({
            ...prev,
            avgResolutionTime: prev.avgResolutionTime ?? null,
            userSatisfaction: prev.userSatisfaction ?? null,
          }));
          // Ne pas modifier techniciansSatisfaction en cas d'erreur
        }

         // Charger les notifications
         await loadNotifications();
         await loadUnreadCount();
       } catch (err) {
         console.error("Erreur chargement données:", err);
       }
    }
    void loadData();
    void loadNotifications();
    void loadUnreadCount();

    // Recharger automatiquement les tickets et notifications toutes les 30 secondes
    // Cela permet aux métriques (temps moyen, satisfaction, etc.) de se mettre à jour automatiquement avec les données réelles
    const interval = setInterval(() => {
      void loadTickets(ticketSearchQuery); // Rafraîchir les tickets pour mettre à jour les métriques automatiquement
      void loadNotifications();
      void loadUnreadCount();
    }, 30000);
     
     return () => clearInterval(interval);
  }, [token, ticketSearchQuery]);

  // Debounce pour la recherche de tickets
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadTickets(ticketSearchQuery);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [ticketSearchQuery, token]);

  // Recalculer les tickets délégués quand allTickets ou userInfo change
  useEffect(() => {
    async function recalculateDelegatedTickets() {
      if (userRole === "DSI" && userInfo?.id && allTickets && allTickets.length > 0) {
        const delegatedTickets = allTickets.filter((t: Ticket) => t.secretary_id !== null && t.secretary_id !== undefined);
        const ticketsDelegatedByMe = new Set<string>();
        const dsiIdStr = String(userInfo.id);
        
        // Vérifier l'historique de chaque ticket délégué
        for (const ticket of delegatedTickets) {
          try {
            const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (historyRes.ok) {
              const history: TicketHistory[] = await historyRes.json();
              
              // Chercher une entrée d'historique où le DSI connecté a délégué le ticket
              // Critères : user_id correspond au DSI connecté ET (raison contient mots-clés de délégation OU changement vers "en_attente_analyse")
              const delegationEntry = history.find((h: TicketHistory) => {
                const userIdMatches = String(h.user_id) === dsiIdStr;
                if (!userIdMatches) return false;
                
                // Vérifier si le reason contient des mots-clés de délégation
                const reasonLower = (h.reason || "").toLowerCase();
                const hasDelegationKeywords = reasonLower.includes("délégu") || 
                                               reasonLower.includes("delegat") ||
                                               reasonLower.includes("adjoint") ||
                                               reasonLower.includes("délégation");
                
                // Vérifier si le statut a été changé vers "en_attente_analyse" (car lors de la délégation, le statut est mis à "en_attente_analyse")
                const statusChangedToPending = h.new_status === "en_attente_analyse";
                
                // Si l'ancien statut n'était pas "en_attente_analyse", c'est plus probablement une délégation
                const wasNotAlreadyPending = h.old_status !== "en_attente_analyse";
                
                // Un ticket est délégué si :
                // 1. La raison contient des mots-clés de délégation, OU
                // 2. Le DSI a mis le ticket en "en_attente_analyse" (et il n'était pas déjà en attente)
                return hasDelegationKeywords || (statusChangedToPending && wasNotAlreadyPending);
              });
              
              if (delegationEntry) {
                ticketsDelegatedByMe.add(ticket.id);
              } else {
                // Fallback : si le ticket a un secretary_id et le DSI connecté a une entrée dans l'historique
                // qui met le ticket en "en_attente_analyse", considérer comme délégation
                const hasDSIEntryWithPendingStatus = history.some((h: TicketHistory) => 
                  String(h.user_id) === dsiIdStr && 
                  h.new_status === "en_attente_analyse"
                );
                
                if (hasDSIEntryWithPendingStatus) {
                  ticketsDelegatedByMe.add(ticket.id);
                }
              }
            }
          } catch (err) {
            console.error(`Erreur lors du chargement de l'historique du ticket ${ticket.id}:`, err);
          }
        }
        
        setDelegatedTicketsByMe(ticketsDelegatedByMe);
        console.log(`[Recalcul] Tickets délégués par le DSI (${userInfo.id}): ${ticketsDelegatedByMe.size} sur ${delegatedTickets.length} tickets avec secretary_id`);
      } else if (userRole === "DSI" && userInfo?.id && (!allTickets || allTickets.length === 0)) {
        setDelegatedTicketsByMe(new Set());
      }
    }
    
    void recalculateDelegatedTickets();
  }, [allTickets, userInfo, userRole, token]);

  // Recalculer les métriques quand allTickets change (quand un ticket est traité)
  useEffect(() => {
    if (allTickets.length === 0) return;
    
    async function recalculateMetrics() {
      try {
        // Fonction helper pour formater le temps en heures et minutes
        const formatTimeInHoursMinutes = (hoursDecimal: number): string => {
          if (hoursDecimal === 0) return "0 mn";
          
          // Afficher en heures et minutes
          const hours = Math.floor(hoursDecimal);
          const minutes = Math.floor((hoursDecimal - hours) * 60);
          if (hours === 0) {
            return `${minutes} mn`;
          } else if (minutes === 0) {
            return `${hours} h`;
          } else {
            return `${hours} h ${minutes} mn`;
          }
        };
        
        // Même logique de calcul que dans loadData mais uniquement pour les métriques
        const resolvedTickets = allTickets.filter((t: Ticket) => t.status === "resolu" || t.status === "cloture");
        let totalResolutionTimeHours = 0;
        let resolvedCount = 0;
        const satisfactionScores: number[] = [];
        const techniciansSatisfactionScores: number[] = [];
        
        // Fonction pour calculer la satisfaction implicite (même logique que dans loadData)
        const calculateImplicitSatisfaction = async (ticket: Ticket, history: TicketHistory[]): Promise<number> => {
          let score = 0;
          if (ticket.created_at) {
            const created = new Date(ticket.created_at);
            let resolvedDate: Date | null = null;
            if (ticket.status === "cloture" && ticket.closed_at) {
              resolvedDate = new Date(ticket.closed_at);
            } else if (ticket.status === "resolu" && ticket.resolved_at) {
              resolvedDate = new Date(ticket.resolved_at);
            }
            
            if (resolvedDate) {
              const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
              const diffDays = diffHours / 24;
              
              let resolutionScore = 0;
              if (ticket.priority === "haute" || ticket.priority === "critique") {
                if (diffHours < 24) resolutionScore = 100;
                else if (diffHours < 48) resolutionScore = 80;
                else if (diffHours < 72) resolutionScore = 60;
                else resolutionScore = 40;
              } else if (ticket.priority === "moyenne") {
                if (diffDays < 3) resolutionScore = 100;
                else if (diffDays < 5) resolutionScore = 80;
                else if (diffDays < 7) resolutionScore = 60;
                else resolutionScore = 40;
              } else {
                if (diffDays < 7) resolutionScore = 100;
                else if (diffDays < 14) resolutionScore = 80;
                else if (diffDays < 21) resolutionScore = 60;
                else resolutionScore = 40;
              }
              score += resolutionScore * 0.4;
            }
            
            const reopenCount = history.filter(h => h.old_status === "cloture" || h.old_status === "resolu").length;
            if (reopenCount === 0) score += 100 * 0.3;
            else if (reopenCount === 1) score += 70 * 0.3;
            else score += 40 * 0.3;
            
            const assignmentChanges = history.filter(h => h.new_status === "assigne_technicien" || h.new_status === "en_cours").length;
            if (assignmentChanges <= 1) score += 100 * 0.2;
            else if (assignmentChanges === 2) score += 50 * 0.2;
            else score += 20 * 0.2;
            
            const firstResponse = history.find(h => h.new_status === "assigne_technicien" || h.new_status === "en_cours");
            if (firstResponse && ticket.created_at) {
              const created = new Date(ticket.created_at);
              const firstResponseTime = new Date(firstResponse.changed_at);
              const responseHours = (firstResponseTime.getTime() - created.getTime()) / (1000 * 60 * 60);
              if (responseHours < 2) score += 100 * 0.1;
              else if (responseHours < 4) score += 80 * 0.1;
              else if (responseHours < 8) score += 60 * 0.1;
              else score += 40 * 0.1;
            } else {
              score += 60 * 0.1;
            }
          }
          return Math.round(score);
        };
        
        await Promise.all(
          resolvedTickets.map(async (ticket: Ticket) => {
            if (!ticket.created_at) return;
            
            try {
              const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              
              if (historyRes.ok) {
                const history: TicketHistory[] = await historyRes.json();
                const resolutionHistory = history.find(h => h.new_status === "resolu" || h.new_status === "cloture");
                
                let resolvedDate: Date | null = null;
                if (resolutionHistory && resolutionHistory.changed_at) {
                  resolvedDate = new Date(resolutionHistory.changed_at);
                } else if (ticket.status === "cloture" && ticket.closed_at) {
                  resolvedDate = new Date(ticket.closed_at);
                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                  resolvedDate = new Date(ticket.resolved_at);
                }
                
                if (resolvedDate && ticket.created_at) {
                  const created = new Date(ticket.created_at);
                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                  if (diffHours >= 0) {
                    totalResolutionTimeHours += diffHours;
                    resolvedCount++;
                  }
                }
                
                let score: number | null = null;
                if (ticket.feedback_score !== null && ticket.feedback_score !== undefined && ticket.feedback_score > 0) {
                  score = (ticket.feedback_score / 5) * 100;
                  satisfactionScores.push(score);
                } else {
                  score = await calculateImplicitSatisfaction(ticket, history);
                  satisfactionScores.push(score);
                }
                
                if (ticket.technician_id !== null && score !== null) {
                  techniciansSatisfactionScores.push(score);
                }
              }
            } catch (err) {
              console.error(`Erreur historique ticket ${ticket.id}:`, err);
              if (ticket.created_at) {
                let resolvedDate: Date | null = null;
                if (ticket.status === "cloture" && ticket.closed_at) {
                  resolvedDate = new Date(ticket.closed_at);
                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                  resolvedDate = new Date(ticket.resolved_at);
                }
                
                if (resolvedDate) {
                  const created = new Date(ticket.created_at);
                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                  if (diffHours >= 0) {
                    totalResolutionTimeHours += diffHours;
                    resolvedCount++;
                  }
                }
              }
              
              if (ticket.feedback_score !== null && ticket.feedback_score !== undefined && ticket.feedback_score > 0) {
                const score = (ticket.feedback_score / 5) * 100;
                satisfactionScores.push(score);
                if (ticket.technician_id !== null) {
                  techniciansSatisfactionScores.push(score);
                }
              }
            }
          })
        );
        
        const avgResolutionHours = resolvedCount > 0 ? totalResolutionTimeHours / resolvedCount : 0;
        // Ne mettre à jour que si on a des données valides (ne pas mettre "0 mn")
        const avgResolutionTimeFormatted = resolvedCount > 0 ? formatTimeInHoursMinutes(avgResolutionHours) : null;
        let satisfactionPct: string | null = null;
        if (satisfactionScores.length > 0) {
          const avgSatisfaction = satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length;
          satisfactionPct = avgSatisfaction.toFixed(1);
        }
        
        // Ne mettre à jour techniciansSatisfaction que si on a des données valides
        let techniciansSatisfactionPct: string | null = null;
        if (techniciansSatisfactionScores.length > 0) {
          const avgTechniciansSatisfaction = techniciansSatisfactionScores.reduce((sum, score) => sum + score, 0) / techniciansSatisfactionScores.length;
          techniciansSatisfactionPct = avgTechniciansSatisfaction.toFixed(1);
        }
        
        // Mettre à jour seulement si on a calculé de nouvelles valeurs valides
        if (avgResolutionTimeFormatted !== null || satisfactionPct !== null) {
          setMetrics(prev => ({
            ...prev,
            avgResolutionTime: avgResolutionTimeFormatted ?? prev.avgResolutionTime,
            userSatisfaction: satisfactionPct !== null ? `${satisfactionPct}%` : prev.userSatisfaction,
          }));
        }
        // Ne mettre à jour techniciansSatisfaction que si on a une nouvelle valeur valide
        if (techniciansSatisfactionPct !== null) {
          setTechniciansSatisfaction(techniciansSatisfactionPct);
        }
      } catch (err) {
        console.error("Erreur recalcul métriques:", err);
      }
    }
    
    void recalculateMetrics();
  }, [allTickets, token]);

  // Calculer le taux de réouverture quand on est dans la section métriques
  useEffect(() => {
    if (selectedReport === "metriques" && !reopeningCalculated && allTickets.length > 0) {
      const checkReopenedTickets = async () => {
        let reopenedCount = 0;
        
        // Vérifier tous les tickets pour voir s'ils ont été réouverts
        await Promise.all(
          allTickets.map(async (ticket) => {
            try {
              const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (historyRes.ok) {
                const history: TicketHistory[] = await historyRes.json();
                // Vérifier si le ticket a été résolu/clôturé puis réouvert
                const resolutionIndex = history.findIndex(h => 
                  h.new_status === "resolu" || h.new_status === "cloture"
                );
                if (resolutionIndex >= 0) {
                  // Vérifier s'il y a un changement de statut après la résolution
                  const afterResolution = history.slice(resolutionIndex + 1);
                  if (afterResolution.length > 0 && 
                      afterResolution.some(h => 
                        h.new_status !== "resolu" && h.new_status !== "cloture"
                      )) {
                    reopenedCount++;
                  }
                }
              }
            } catch (err) {
              console.error(`Erreur historique ticket ${ticket.id}:`, err);
            }
          })
        );
        
        setReopenedTicketsCount(reopenedCount);
        setReopeningCalculated(true);
      };
      
      void checkReopenedTickets();
    }
    
    // Réinitialiser quand on change de section
    if (selectedReport !== "metriques") {
      setReopeningCalculated(false);
      setReopenedTicketsCount(0);
    }
  }, [selectedReport, allTickets, token, reopeningCalculated]);

  // Fonction pour filtrer les techniciens selon le type du ticket
  function getFilteredTechnicians(ticketType: string | undefined): Technician[] {
    if (!ticketType) return technicians;
    
    // Si le ticket est de type "materiel", afficher uniquement les techniciens matériel
    if (ticketType === "materiel") {
      return technicians.filter(tech => tech.specialization === "materiel");
    }
    
    // Si le ticket est de type "applicatif", afficher uniquement les techniciens applicatif
    if (ticketType === "applicatif") {
      return technicians.filter(tech => tech.specialization === "applicatif");
    }
    
    // Par défaut, retourner tous les techniciens
    return technicians;
  }

  async function handleAssign(ticketId: string) {
    if (!selectedTechnician) {
      alert("Veuillez sélectionner un technicien");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/assign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          technician_id: selectedTechnician,
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        setSelectedTechnician("");
        setAssignmentNotes("");
        setShowAssignModal(false);
        setAssignTicketId(null);
        alert("Ticket assigné avec succès");
      } else {
        let errorMessage = "Impossible d'assigner le ticket";
        try {
          const error = await res.json();
          errorMessage = error.detail || error.message || errorMessage;
        } catch (e) {
          const errorText = await res.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        alert(`Erreur: ${errorMessage}`);
      }
    } catch (err) {
      console.error("Erreur assignation:", err);
      const errorMessage = err instanceof Error ? err.message : "Erreur lors de l'assignation";
      alert(`Erreur: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

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
        setShowTicketDetailsPage(true);
      } else {
        alert("Erreur lors du chargement des détails du ticket");
      }
    } catch {
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

  async function handleReassign(ticketId: string) {
    if (!selectedTechnician) {
      alert("Veuillez sélectionner un technicien pour la réassignation");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/reassign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          technician_id: selectedTechnician,
          reason: "Réassignation par DSI",
          notes: assignmentNotes || undefined,
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        setSelectedTechnician("");
        setAssignmentNotes("");
        setShowReassignModal(false);
        setReassignTicketId(null);
        alert("Ticket réassigné avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de réassigner le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur réassignation:", err);
      alert("Erreur lors de la réassignation");
    } finally {
      setLoading(false);
    }
  }

  function handleReassignClick(ticketId: string) {
    setReassignTicketId(ticketId);
    setSelectedTechnician("");
    setAssignmentNotes("");
    setShowReassignModal(true);
  }

  function handleAssignClick(ticketId: string) {
    setAssignTicketId(ticketId);
    setSelectedTechnician("");
    setAssignmentNotes("");
    setShowAssignModal(true);
  }
  function handleDelegateClick(ticketId: string) {
    setDelegateTicketId(ticketId);
    setSelectedAdjoint("");
    setAssignmentNotes("");
    setShowDelegateModal(true);
  }
  async function handleDelegate(ticketId: string) {
    if (!selectedAdjoint) {
      alert("Veuillez sélectionner un adjoint DSI");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/delegate-adjoint`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adjoint_id: selectedAdjoint,
          reason: assignmentNotes || undefined,
          notes: assignmentNotes || undefined,
        }),
      });
      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        setSelectedAdjoint("");
        setAssignmentNotes("");
        setShowDelegateModal(false);
        setDelegateTicketId(null);
        alert("Ticket délégué à un adjoint avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de déléguer le ticket"}`);
      }
    } catch (err) {
      alert("Erreur lors de la délégation");
    } finally {
      setLoading(false);
    }
  }

  // Fonction helper pour vérifier si l'utilisateur peut escalader
  function canEscalate(): boolean {
    return userRole === "Adjoint DSI" || userRole === "DSI" || userRole === "Admin";
  }

  async function handleEscalate(ticketId: string) {
    if (!confirm("Êtes-vous sûr de vouloir escalader ce ticket ? La priorité sera augmentée.")) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/escalate`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        alert("Ticket escaladé avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible d'escalader le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur escalade:", err);
      alert("Erreur lors de l'escalade");
    } finally {
      setLoading(false);
    }
  }

  async function handleClose(ticketId: string) {
    if (!confirm("Êtes-vous sûr de vouloir clôturer ce ticket ?")) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "cloture",
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        alert("Ticket clôturé avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de clôturer le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur clôture:", err);
      alert("Erreur lors de la clôture");
    } finally {
      setLoading(false);
    }
  }

  async function loadRejectionReason(ticketId: string) {
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const history = await res.json();
        console.log("Historique du ticket:", history); // Debug
        // Trouver l'entrée d'historique correspondant au rejet
        const rejectionEntry = history.find((h: any) => 
          h.new_status === "rejete" && h.reason && (
            h.reason.includes("Validation utilisateur: Rejeté") || 
            h.reason.includes("Rejeté")
          )
        );
        console.log("Entrée de rejet trouvée:", rejectionEntry); // Debug
        if (rejectionEntry && rejectionEntry.reason) {
          // Extraire le motif du format "Validation utilisateur: Rejeté. Motif: [motif]"
          const match = rejectionEntry.reason.match(/Motif:\s*(.+)/);
          const extractedReason = match ? match[1].trim() : rejectionEntry.reason;
          console.log("Motif extrait:", extractedReason); // Debug
          return extractedReason;
        }
      } else {
        console.error("Erreur HTTP:", res.status, res.statusText);
      }
      return "Motif non disponible";
    } catch (err) {
      console.error("Erreur chargement historique:", err);
      return "Erreur lors du chargement du motif";
    }
  }

  async function handleReopenClick(ticketId: string) {
    setReopenTicketId(ticketId);
    setShowReopenModal(true);
    setSelectedTechnician("");
    setAssignmentNotes("");
    setRejectionReason("");
    setLoadingRejectionReason(true);
    
    try {
      const reason = await loadRejectionReason(ticketId);
      setRejectionReason(reason);
    } catch (err) {
      console.error("Erreur:", err);
      setRejectionReason("Erreur lors du chargement du motif de rejet");
    } finally {
      setLoadingRejectionReason(false);
    }
  }

  async function handleReopen(ticketId: string) {
    if (!selectedTechnician) {
      alert("Veuillez sélectionner un technicien pour la réouverture");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/tickets/${ticketId}/reopen`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          technician_id: selectedTechnician,
          reason: assignmentNotes || "Réouverture après rejet utilisateur",
        }),
      });

      if (res.ok) {
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
        }
        setSelectedTechnician("");
        setAssignmentNotes("");
        setReopenTicketId(null);
        setRejectionReason("");
        setShowReopenModal(false);
        alert("Ticket réouvert et réassigné avec succès");
      } else {
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible de réouvrir le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur réouverture:", err);
      alert("Erreur lors de la réouverture");
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les tickets selon leur statut
  const pendingTickets = allTickets.filter((t) => t.status === "en_attente_analyse");
  const assignedTickets = allTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours");
  const resolvedTickets = allTickets.filter((t) => t.status === "resolu");
  const closedTickets = allTickets.filter((t) => t.status === "cloture");
  const rejectedTickets = allTickets.filter((t) => t.status === "rejete");

  const pendingCount = pendingTickets.length;
  const assignedCount = assignedTickets.length;
  const resolvedCount = resolvedTickets.length;
  const closedCount = closedTickets.length;
  const totalTicketsCount = allTickets.length;
  // Taux de résolution GLOBAL = (résolu + clôturé) / total
  const resolvedOrClosedCount = resolvedCount + closedCount;
  const resolutionRate =
    totalTicketsCount > 0 ? `${Math.round((resolvedOrClosedCount / totalTicketsCount) * 100)}%` : "0%";

  // Statistiques agrégées pour la section Techniciens
  const activeTechniciansCount = technicians.filter((tech) => {
    return tech.actif === true;
  }).length;

  const ticketsInProgressCount = assignedCount;

  // Taux de résolution pour les TECHNICIENS (uniquement les tickets assignés aux techniciens)
  const ticketsAssignedToTechnicians = allTickets.filter((t) => t.technician_id !== null);
  const ticketsResolvedByTechnicians = ticketsAssignedToTechnicians.filter(
    (t) => t.status === "resolu" || t.status === "cloture"
  );
  const resolutionRateForTechnicians =
    ticketsAssignedToTechnicians.length > 0
      ? `${Math.round((ticketsResolvedByTechnicians.length / ticketsAssignedToTechnicians.length) * 100)}%`
      : "0%";

  // Satisfaction moyenne pour les TECHNICIENS (calculée avec le système hybride dans le useEffect)
  // Utiliser l'état techniciansSatisfaction qui est mis à jour dans le useEffect
  const averageSatisfactionForTechniciansPercentage = techniciansSatisfaction;

  // Fonctions pour préparer les données des graphiques
  const prepareTimeSeriesData = () => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date;
    });

    return last30Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at).toISOString().split('T')[0];
        return ticketDate === dateStr;
      });
      const resolvedDayTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at).toISOString().split('T')[0];
        return ticketDate === dateStr && (t.status === "resolu" || t.status === "cloture");
      });

      return {
        date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        créés: dayTickets.length,
        résolus: resolvedDayTickets.length
      };
    });
  };

  const prepareStatusEvolutionData = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date;
    });

    return last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at).toISOString().split('T')[0];
        return ticketDate === dateStr;
      });

      return {
        date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        'En attente': dayTickets.filter(t => t.status === "en_attente_analyse").length,
        'En cours': dayTickets.filter(t => t.status === "assigne_technicien" || t.status === "en_cours").length,
        'Résolus': dayTickets.filter(t => t.status === "resolu").length,
        'Clôturés': dayTickets.filter(t => t.status === "cloture").length
      };
    });
  };

  const preparePriorityEvolutionData = () => {
    const priorities = ['critique', 'haute', 'moyenne', 'faible'];
    return priorities.map(priority => ({
      priorité: priority.charAt(0).toUpperCase() + priority.slice(1),
      nombre: allTickets.filter(t => t.priority === priority).length
    }));
  };

  const prepareDayOfWeekData = () => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    return days.map((day, index) => {
      const dayTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at);
        return ticketDate.getDay() === (index === 6 ? 0 : index + 1);
      });
      return {
        jour: day,
        tickets: dayTickets.length
      };
    });
  };

  const prepareHourlyData = () => {
    return Array.from({ length: 24 }, (_, i) => {
      const hourTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at);
        return ticketDate.getHours() === i;
      });
      return {
        heure: `${i}h`,
        tickets: hourTickets.length
      };
    });
  };

  const prepareSatisfactionData = () => {
    const ticketsWithFeedback = allTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
    if (ticketsWithFeedback.length === 0) return [];

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date;
    });

    return last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const dayTickets = ticketsWithFeedback.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at).toISOString().split('T')[0];
        return ticketDate === dateStr;
      });
      const avgSatisfaction = dayTickets.length > 0
        ? dayTickets.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / dayTickets.length
        : 0;

      return {
        date: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        satisfaction: Number(avgSatisfaction.toFixed(1))
      };
    });
  };

  // Fonction pour préparer les données du graphique "Tickets cette semaine"
  const prepareWeeklyTicketsData = () => {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const today = new Date();
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Lundi = 1, Dimanche = 0
    startOfWeek.setDate(today.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);

    return days.map((day, index) => {
      const currentDay = new Date(startOfWeek);
      currentDay.setDate(startOfWeek.getDate() + index);
      const nextDay = new Date(currentDay);
      nextDay.setDate(currentDay.getDate() + 1);

      // Tickets créés ce jour
      const createdTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at);
        return ticketDate >= currentDay && ticketDate < nextDay;
      });

      // Tickets résolus ce jour
      const resolvedTickets = allTickets.filter(t => {
        if (!t.resolved_at) return false;
        const ticketDate = new Date(t.resolved_at);
        return ticketDate >= currentDay && ticketDate < nextDay;
      });

      return {
        jour: day,
        Créés: createdTickets.length,
        Résolus: resolvedTickets.length
      };
    });
  };

  // Fonction pour préparer les données du graphique "Évolution mensuelle par type"
  const prepareMonthlyEvolutionData = () => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    return months.map((month, index) => {
      const monthIndex = index; // Janvier = 0, Février = 1, etc.
      const startOfMonth = new Date(currentYear, monthIndex, 1);
      const endOfMonth = new Date(currentYear, monthIndex + 1, 0, 23, 59, 59, 999);

      // Tickets Matériel ce mois
      const materielTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at);
        return ticketDate >= startOfMonth && ticketDate <= endOfMonth && 
               (t.type === "materiel" || t.type?.toLowerCase() === "materiel" || 
                t.category?.toLowerCase().includes("materiel"));
      });

      // Tickets Applicatif ce mois
      const applicatifTickets = allTickets.filter(t => {
        if (!t.created_at) return false;
        const ticketDate = new Date(t.created_at);
        return ticketDate >= startOfMonth && ticketDate <= endOfMonth && 
               (t.type === "applicatif" || t.type?.toLowerCase() === "applicatif" || 
                t.category?.toLowerCase().includes("applicatif"));
      });

      return {
        mois: month,
        Matériel: materielTickets.length,
        Applicatif: applicatifTickets.length
      };
    });
  };

  // Fonction pour préparer les données du graphique "Répartition par priorité"
  const preparePriorityData = () => {
    const critique = allTickets.filter(t => t.priority === "critique").length;
    const haute = allTickets.filter(t => t.priority === "haute").length;
    const moyenne = allTickets.filter(t => t.priority === "moyenne").length;
    const basse = allTickets.filter(t => t.priority === "basse" || t.priority === "faible").length;
    const total = allTickets.length;
    
    return [
      { name: "Critique", value: critique, percentage: total > 0 ? Math.round((critique / total) * 100) : 0 },
      { name: "Haute", value: haute, percentage: total > 0 ? Math.round((haute / total) * 100) : 0 },
      { name: "Moyenne", value: moyenne, percentage: total > 0 ? Math.round((moyenne / total) * 100) : 0 },
      { name: "Basse", value: basse, percentage: total > 0 ? Math.round((basse / total) * 100) : 0 }
    ];
  };

  // Fonction pour préparer les données du graphique "Répartition par statut"
  const prepareStatusData = () => {
    // Tickets délégués par le DSI connecté (priorité sur les autres catégories)
    const delegue = allTickets.filter(t => delegatedTicketsByMe.has(t.id)).length;
    
    // Tickets en cours (excluant les délégués par le DSI connecté)
    const enCours = allTickets.filter(t => 
      (t.status === "en_cours" || t.status === "assigne_technicien") && 
      !delegatedTicketsByMe.has(t.id)
    ).length;
    
    // Tickets ouverts (excluant les délégués par le DSI connecté)
    const ouvert = allTickets.filter(t => 
      (t.status === "ouvert" || t.status === "en_attente_analyse") && 
      !delegatedTicketsByMe.has(t.id)
    ).length;
    
    // Tickets relancés (excluant les délégués par le DSI connecté)
    const relance = allTickets.filter(t => 
      t.status === "rejete" && 
      !delegatedTicketsByMe.has(t.id)
    ).length;
    
    // Tickets résolus (excluant les délégués par le DSI connecté)
    const resolu = allTickets.filter(t => 
      t.status === "resolu" && 
      !delegatedTicketsByMe.has(t.id)
    ).length;
    
    const total = allTickets.length;
    
    return [
      { name: "En cours", value: enCours, percentage: total > 0 ? Math.round((enCours / total) * 100) : 0 },
      { name: "En attente d'assignation", value: ouvert, percentage: total > 0 ? Math.round((ouvert / total) * 100) : 0 },
      { name: "Relancé", value: relance, percentage: total > 0 ? Math.round((relance / total) * 100) : 0 },
      { name: "Résolu", value: resolu, percentage: total > 0 ? Math.round((resolu / total) * 100) : 0 },
      { name: "Délégué", value: delegue, percentage: total > 0 ? Math.round((delegue / total) * 100) : 0 }
    ];
  };

  // Couleurs pour les graphiques
  const colors = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    purple: '#a855f7',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    orange: '#f97316',
    cyan: '#06b6d4'
  };

  const statusColors = {
    'En attente': '#f59e0b',
    'En cours': '#3b82f6',
    'Résolus': '#10b981',
    'Clôturés': '#6b7280'
  };

  const priorityColors = {
    'Critique': '#E53E3E',
    'Haute': '#F59E0B',
    'Moyenne': '#0DADDB',
    'Faible': '#6b7280'
  };

  const prepareAgencyData = () => {
    const agencies = Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)));
    return agencies.map(agency => {
      const agencyTickets = allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency);
      return {
        agence: agency,
        tickets: agencyTickets.length
      };
    }).sort((a, b) => b.tickets - a.tickets); // Trier par ordre décroissant
  };

  // Fonctions pour préparer les données sur les rôles/utilisateurs
  const prepareUsersByRoleData = () => {
    const roleCounts: { [key: string]: number } = {};
    allUsers.forEach((user: any) => {
      const roleName = user.role?.name || "Sans rôle";
      roleCounts[roleName] = (roleCounts[roleName] || 0) + 1;
    });
    return Object.entries(roleCounts).map(([role, count]) => ({
      rôle: role,
      nombre: count
    })).sort((a, b) => b.nombre - a.nombre);
  };

  // Fonction pour préparer les données sur les techniciens par spécialisation
  const prepareTechniciansBySpecializationData = () => {
    const specializationCounts: { [key: string]: number } = {};
    technicians.forEach((tech) => {
      const spec = tech.specialization || "Non spécifié";
      specializationCounts[spec] = (specializationCounts[spec] || 0) + 1;
    });
    return Object.entries(specializationCounts).map(([spec, count]) => ({
      spécialisation: spec,
      nombre: count
    }));
  };

  // Fonction pour préparer les données sur la charge de travail par technicien
  const prepareTechnicianWorkloadData = () => {
    return technicians.map((tech) => {
      const assignedTickets = allTickets.filter((t) => t.technician_id === tech.id);
      const resolvedTickets = assignedTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
      return {
        technicien: tech.full_name,
        assignés: assignedTickets.length,
        résolus: resolvedTickets.length
      };
    }).sort((a, b) => b.assignés - a.assignés).slice(0, 10); // Top 10
  };

  // Fonction pour préparer les données "Analyse par agence" (Total, Résolus, En attente)
  const prepareAgencyAnalysisData = () => {
    const agencies = Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)));
    
    // Si aucune agence, utiliser les 5 agences par défaut avec des données vides
    const defaultAgencies = ["Siège Abidjan", "Agence Cocody", "Agence Plateau", "Agence Marcory", "Agence Yopougon"];
    const allAgencies = agencies.length > 0 ? agencies : defaultAgencies;
    
    return allAgencies.map(agency => {
      const agencyTickets = allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency);
      const total = agencyTickets.length;
      const resolved = agencyTickets.filter((t) => t.status === "resolu" || t.status === "cloture").length;
      const pending = agencyTickets.filter((t) => t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours").length;
      
      return {
        agence: agency,
        Total: total,
        Résolus: resolved,
        "En attente": pending
      };
    }).sort((a, b) => b.Total - a.Total).slice(0, 5); // Top 5 agences
  };

  // Fonction pour préparer les données "Performance des techniciens"
  const prepareTechnicianPerformanceData = () => {
    return technicians.map((tech) => {
      // Utiliser les données du backend qui sont plus fiables
      const resolvedCount = (tech.resolved_tickets_count || 0) + (tech.closed_tickets_count || 0);
      
      // Calculer le temps moyen de résolution en heures
      let avgTimeHours = 0;
      if (tech.avg_resolution_time_days) {
        avgTimeHours = tech.avg_resolution_time_days * 24;
      } else {
        // Fallback: calculer depuis les tickets si disponible
        const assignedTickets = allTickets.filter((t) => t.technician_id === tech.id);
        const resolvedTickets = assignedTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
        if (resolvedTickets.length > 0) {
          const times: number[] = [];
          resolvedTickets.forEach(ticket => {
            if (ticket.created_at && ticket.resolved_at) {
              const created = new Date(ticket.created_at).getTime();
              const resolved = new Date(ticket.resolved_at).getTime();
              const diffHours = (resolved - created) / (1000 * 60 * 60);
              if (diffHours > 0) {
                times.push(diffHours);
              }
            }
          });
          if (times.length > 0) {
            avgTimeHours = times.reduce((a, b) => a + b, 0) / times.length;
          }
        }
      }
      
      // Calculer le pourcentage de performance (taux de réussite)
      const assignedTickets = allTickets.filter((t) => t.technician_id === tech.id);
      const performance = tech.success_rate || (resolvedCount > 0 && assignedTickets.length > 0 
        ? Math.round((resolvedCount / assignedTickets.length) * 100) 
        : 0);
      
      return {
        technicien: tech.full_name,
        performance: resolvedCount, // Nombre de tickets résolus pour la hauteur des barres
        avgTimeHours: avgTimeHours,
        performancePercent: performance,
        resolvedCount: resolvedCount
      };
    }).sort((a, b) => b.performance - a.performance); // Tous les techniciens triés par performance
  };

  // Fonction pour préparer les données sur les utilisateurs les plus actifs (créateurs de tickets)
  const prepareMostActiveUsersData = () => {
    const userTicketCounts: { [key: string]: { name: string; count: number } } = {};
    allTickets.forEach((ticket) => {
      const userId = ticket.creator_id;
      const userName = ticket.creator?.full_name || "Utilisateur inconnu";
      if (userId) {
        if (!userTicketCounts[userId]) {
          userTicketCounts[userId] = { name: userName, count: 0 };
        }
        userTicketCounts[userId].count += 1;
      }
    });
    return Object.values(userTicketCounts)
      .map((user) => ({
        utilisateur: user.name,
        tickets: user.count
      }))
      .sort((a, b) => b.tickets - a.tickets)
      .slice(0, 10); // Top 10
  };

  // Fonction pour préparer les données sur le temps moyen de résolution par type
  const prepareResolutionTimeByTypeData = () => {
    const typeData: { [key: string]: { total: number; count: number } } = {};
    allTickets.forEach((ticket) => {
      if (ticket.type && ticket.resolved_at && ticket.created_at) {
        const created = new Date(ticket.created_at).getTime();
        const resolved = new Date(ticket.resolved_at).getTime();
        const hours = (resolved - created) / (1000 * 60 * 60);
        
        if (!typeData[ticket.type]) {
          typeData[ticket.type] = { total: 0, count: 0 };
        }
        typeData[ticket.type].total += hours;
        typeData[ticket.type].count += 1;
      }
    });
    return Object.entries(typeData).map(([type, data]) => ({
      type: type === "materiel" ? "Matériel" : "Applicatif",
      tempsMoyen: data.count > 0 ? Math.round(data.total / data.count) : 0
    }));
  };

  // Fonctions pour analyser les problèmes récurrents
  const getMostFrequentProblems = () => {
    // Analyser les titres de tickets pour trouver des patterns récurrents significatifs
    // Utiliser les titres complets des tickets récurrents plutôt que des mots individuels
    const ticketGroups: { [key: string]: { title: string; count: number } } = {};
    
    allTickets.forEach(ticket => {
      if (ticket.title) {
        // Normaliser le titre pour grouper les tickets similaires
        const normalizedTitle = ticket.title.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .trim();
        
        // Utiliser les premiers mots significatifs comme clé (3-5 mots)
        const words = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
        if (words.length >= 3) {
          // Prendre les 3-5 premiers mots significatifs
          const key = words.slice(0, Math.min(5, words.length)).join(' ');
          
          if (!ticketGroups[key]) {
            ticketGroups[key] = { title: ticket.title, count: 0 };
          }
          ticketGroups[key].count += 1;
        }
      }
    });

    // Filtrer pour ne garder que les patterns qui apparaissent au moins 2 fois
    // Retourner TOUS les problèmes (pas de limitation)
    return Object.values(ticketGroups)
      .filter(item => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .map(item => ({
        problème: item.title,
        occurrences: item.count
      }));
  };

  const getProblematicApplications = () => {
    // Analyser les types de tickets et les titres pour identifier les applications/équipements problématiques
    const typeCounts: { [key: string]: number } = {};
    
    allTickets.forEach(ticket => {
      const type = ticket.type || 'autre';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        application: type === 'materiel' ? 'Matériel' : type === 'applicatif' ? 'Applicatif' : type.charAt(0).toUpperCase() + type.slice(1),
        tickets: count
      }));
  };

  const getRecurringTicketsHistory = () => {
    // Trouver les tickets avec des titres similaires (problèmes récurrents)
    const ticketGroups: { [key: string]: Ticket[] } = {};
    
    allTickets.forEach(ticket => {
      if (ticket.title) {
        // Normaliser le titre pour grouper les tickets similaires
        const normalizedTitle = ticket.title.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .trim();
        
        // Utiliser les premiers mots comme clé de regroupement
        const key = normalizedTitle.split(/\s+/).slice(0, 3).join(' ');
        
        if (!ticketGroups[key]) {
          ticketGroups[key] = [];
        }
        ticketGroups[key].push(ticket);
      }
    });

    // Retourner TOUS les groupes avec plus d'un ticket (problèmes récurrents) - pas de limitation
    return Object.entries(ticketGroups)
      .filter(([_, tickets]) => tickets.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([_, tickets]) => ({
        titre: tickets[0].title,
        occurrences: tickets.length,
        dernier: tickets.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        })[0].created_at
      }));
  };

  // Fonctions d'export pour les rapports
  const exportProblemsHistoryToPDF = (reportType: string = "Problèmes récurrents") => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Rapport: ${reportType}`, 14, 20);
      
      const problems = getRecurringTicketsHistory();
      const mostFrequent = getMostFrequentProblems();
      const problematicApps = getProblematicApplications();
      
      if (problems.length > 0) {
        doc.setFontSize(14);
        doc.text("Historique des problèmes", 14, 35);
        
        const tableData = problems.map(item => [
          item.titre || "",
          item.occurrences.toString(),
          item.dernier ? new Date(item.dernier).toLocaleDateString('fr-FR') : 'N/A'
        ]);
        
        autoTable(doc, {
          startY: 40,
          head: [['Problème', 'Occurrences', 'Dernière occurrence']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 95] },
        });
      }
      
      if (mostFrequent.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || 40;
        doc.setFontSize(14);
        doc.text("Problèmes les plus fréquents", 14, finalY + 15);
        
        const tableData2 = mostFrequent.map(item => [
          item.problème || "",
          item.occurrences.toString()
        ]);
        
        autoTable(doc, {
          startY: finalY + 20,
          head: [['Problème', 'Occurrences']],
          body: tableData2,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 95] },
        });
      }
      
      if (problematicApps.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || 40;
        doc.setFontSize(14);
        doc.text("Applications/équipements problématiques", 14, finalY + 15);
        
        const tableData3 = problematicApps.map(item => [
          item.application || "",
          item.tickets.toString()
        ]);
        
        autoTable(doc, {
          startY: finalY + 20,
          head: [['Application/Équipement', 'Nombre de tickets']],
          body: tableData3,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 95] },
        });
      }
      
      doc.save(`Rapport_${reportType.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("Erreur lors de l'export PDF:", error);
      alert("Erreur lors de l'export PDF");
    }
  };

  // Fonction pour nettoyer les noms de feuilles Excel (caractères interdits: \ / ? * [ ])
  const sanitizeSheetName = (name: string): string => {
    // Excel limite les noms de feuilles à 31 caractères et interdit: \ / ? * [ ]
    return name
      .replace(/[\\/:?*[\]]/g, '-') // Remplacer les caractères interdits par des tirets
      .substring(0, 31); // Limiter à 31 caractères
  };

  const exportProblemsHistoryToExcel = (reportType: string = "Problèmes récurrents") => {
    try {
      const problems = getRecurringTicketsHistory();
      const mostFrequent = getMostFrequentProblems();
      const problematicApps = getProblematicApplications();
      
      const wb = XLSX.utils.book_new();
      let hasSheets = false;
      
      // Feuille 1: Historique des problèmes
      if (problems.length > 0) {
        const wsData = [
          ['Problème', 'Occurrences', 'Dernière occurrence'],
          ...problems.map(item => [
            item.titre || "",
            item.occurrences,
            item.dernier ? new Date(item.dernier).toLocaleDateString('fr-FR') : 'N/A'
          ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Historique des problèmes"));
        hasSheets = true;
      }
      
      // Feuille 2: Problèmes les plus fréquents
      if (mostFrequent.length > 0) {
        const wsData2 = [
          ['Problème', 'Occurrences'],
          ...mostFrequent.map(item => [
            item.problème || "",
            item.occurrences
          ])
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(wsData2);
        XLSX.utils.book_append_sheet(wb, ws2, sanitizeSheetName("Problèmes fréquents"));
        hasSheets = true;
      }
      
      // Feuille 3: Applications/équipements problématiques
      if (problematicApps.length > 0) {
        const wsData3 = [
          ['Application/Équipement', 'Nombre de tickets'],
          ...problematicApps.map(item => [
            item.application || "",
            item.tickets
          ])
        ];
        const ws3 = XLSX.utils.aoa_to_sheet(wsData3);
        XLSX.utils.book_append_sheet(wb, ws3, sanitizeSheetName("Applications-Équipements"));
        hasSheets = true;
      }
      
      // Si aucune feuille n'a été créée, créer une feuille par défaut
      if (!hasSheets) {
        const defaultData = [
          ['Rapport', reportType],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          [''],
          ['Aucune donnée disponible pour ce rapport.']
        ];
        const ws = XLSX.utils.aoa_to_sheet(defaultData);
        XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Rapport"));
      }
      
      // Générer le nom de fichier
      const fileName = `Rapport_${reportType.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Vérifier que le workbook n'est pas vide avant d'écrire
      if (wb.SheetNames.length === 0) {
        throw new Error("Le classeur Excel est vide");
      }
      
      // Essayer d'abord avec writeFile, puis avec une méthode alternative si nécessaire
      try {
        XLSX.writeFile(wb, fileName);
      } catch (writeError) {
        // Méthode alternative utilisant un blob
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Erreur lors de l'export Excel:", error);
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      alert(`Erreur lors de l'export Excel: ${errorMessage}`);
    }
  };

  // Fonction pour obtenir le nom du rapport
  const getReportName = (reportType?: string): string => {
    if (reportType) return reportType;
    const reportNames: { [key: string]: string } = {
      "statistiques": "Statistiques générales",
      "metriques": "Métriques de performance",
      "agence": "Analyses par agence",
      "technicien": "Analyses par technicien",
      "evolution": "Évolutions dans le temps",
      "recurrents": "Problèmes récurrents",
      "performance": "Rapports de Performance",
      "tickets": "Rapports Tickets"
    };
    return reportNames[selectedReport] || "Rapport";
  };

  // Fonction générique pour exporter en PDF selon le type de rapport
  const exportToPDF = (reportType?: string) => {
    const reportName = getReportName(reportType);
    try {
      if (selectedReport === "recurrents") {
        exportProblemsHistoryToPDF(reportName);
      } else if (selectedReport === "statistiques") {
        // Export spécifique pour Statistiques générales
        const doc = new jsPDF();
        let yPos = 20;
        
        // En-tête
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, yPos);
        yPos += 10;
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, yPos);
        yPos += 7;
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, yPos);
        yPos += 15;
        
        // Métriques principales
        doc.setFontSize(14);
        doc.text("Métriques principales", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        doc.text(`Nombre total de tickets: ${allTickets.length}`, 14, yPos);
        yPos += 7;
        doc.text(`Tickets résolus/clôturés: ${resolvedCount + closedCount}`, 14, yPos);
        yPos += 15;
        
        // Répartition par statut
        doc.setFontSize(14);
        doc.text("Répartition par statut", 14, yPos);
        yPos += 10;
        
        const statusData = [
          ["Statut", "Nombre", "Pourcentage"],
          ["En attente", pendingCount.toString(), allTickets.length > 0 ? ((pendingCount / allTickets.length) * 100).toFixed(1) + "%" : "0%"],
          ["Assignés/En cours", assignedCount.toString(), allTickets.length > 0 ? ((assignedCount / allTickets.length) * 100).toFixed(1) + "%" : "0%"],
          ["Résolus", resolvedCount.toString(), allTickets.length > 0 ? ((resolvedCount / allTickets.length) * 100).toFixed(1) + "%" : "0%"],
          ["Clôturés", closedCount.toString(), allTickets.length > 0 ? ((closedCount / allTickets.length) * 100).toFixed(1) + "%" : "0%"],
          ["Relancés", rejectedTickets.length.toString(), allTickets.length > 0 ? ((rejectedTickets.length / allTickets.length) * 100).toFixed(1) + "%" : "0%"]
        ];
        
        autoTable(doc, {
          startY: yPos,
          head: [statusData[0]],
          body: statusData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [0, 123, 255] },
          styles: { fontSize: 10 }
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Répartition par priorité
        doc.setFontSize(14);
        doc.text("Répartition par priorité", 14, yPos);
        yPos += 10;
        
        const priorityData = [
          ["Priorité", "Nombre", "Pourcentage"]
        ];
        
        ["critique", "haute", "moyenne", "faible"].forEach((priority) => {
          const count = allTickets.filter((t) => t.priority === priority).length;
          priorityData.push([
            priority.charAt(0).toUpperCase() + priority.slice(1),
            count.toString(),
            allTickets.length > 0 ? ((count / allTickets.length) * 100).toFixed(1) + "%" : "0%"
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [priorityData[0]],
          body: priorityData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [40, 167, 69] },
          styles: { fontSize: 10 }
        });
        
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else if (selectedReport === "metriques") {
        // Export spécifique pour Métriques de performance
        const doc = new jsPDF();
        let yPos = 20;
        
        // En-tête
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, yPos);
        yPos += 10;
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, yPos);
        yPos += 7;
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, yPos);
        yPos += 15;
        
        // Calculer les métriques principales (identique au calcul dans l'interface)
        const avgResolutionTimeDisplay = metrics.avgResolutionTime ?? "N/A";
        const resolvedTickets = allTickets.filter(t => t.status === "resolu" || t.status === "cloture");
        
        // Taux de satisfaction
        const ticketsWithFeedback = resolvedTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
        const avgFeedback = ticketsWithFeedback.length > 0 
          ? ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length
          : null;
        const rejectedTicketsRpt = allTickets.filter(t => t.status === "rejete");
        const resolvedCountRpt = resolvedTickets.length;
        const rejectedCountRpt = rejectedTicketsRpt.length;
        const denomRpt = resolvedCountRpt + rejectedCountRpt;
        let satisfactionRate = 0;
        if (avgFeedback !== null) {
          satisfactionRate = (avgFeedback / 5) * 100;
        } else if (denomRpt > 0) {
          satisfactionRate = (resolvedCountRpt / denomRpt) * 100;
        }
        
        // Tickets escaladés
        const escalatedTickets = allTickets.filter((t) => 
          t.priority === "critique" && 
          (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours")
        ).length;
        
        // Taux de réouverture
        const totalResolvedOrClosed = resolvedTickets.length;
        const reopeningRate = totalResolvedOrClosed > 0 
          ? ((reopenedTicketsCount / totalResolvedOrClosed) * 100).toFixed(1) 
          : "0.0";
        
        // Volume de tickets - Ce mois
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        const thisMonthTickets = allTickets.filter(t => {
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          return created >= currentMonthStart;
        });
        
        const lastMonthTickets = allTickets.filter(t => {
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          return created >= lastMonthStart && created <= lastMonthEnd;
        });
        
        const thisMonthResolved = thisMonthTickets.filter(t => t.status === "resolu" || t.status === "cloture").length;
        const thisMonthCreated = thisMonthTickets.length;
        const thisMonthPending = thisMonthTickets.filter(t => 
          t.status !== "resolu" && t.status !== "cloture" && t.status !== "rejete"
        ).length;
        
        const lastMonthCreated = lastMonthTickets.length;
        const createdChange = lastMonthCreated > 0 
          ? ((thisMonthCreated - lastMonthCreated) / lastMonthCreated * 100).toFixed(0)
          : "0";
        const resolutionRate = thisMonthCreated > 0 
          ? ((thisMonthResolved / thisMonthCreated) * 100).toFixed(0)
          : "0";
        const pendingRate = thisMonthCreated > 0 
          ? ((thisMonthPending / thisMonthCreated) * 100).toFixed(0)
          : "0";
        
        // Performance par catégorie
        const materielTickets = resolvedTickets.filter(t => t.type === "materiel");
        const applicatifTickets = resolvedTickets.filter(t => t.type === "applicatif");
        
        const calculateAvgTime = (tickets: Ticket[]) => {
          let total = 0;
          let count = 0;
          tickets.forEach(ticket => {
            // Ne compter que les tickets avec une date de création ET une date de résolution/clôture réelle
            if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
              const created = new Date(ticket.created_at);
              const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
              const diffDays = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
              // Ne compter que si le résultat est valide (différence positive)
              if (diffDays >= 0) {
                total += diffDays;
                count++;
              }
            }
          });
          return count > 0 ? (total / count).toFixed(1) : "0.0";
        };
        
        const materielAvgDays = calculateAvgTime(materielTickets);
        const applicatifAvgDays = calculateAvgTime(applicatifTickets);
        
        // Indicateurs clés de performance
        doc.setFontSize(14);
        doc.text("Indicateurs clés de performance", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const kpiData = [
          ["Indicateur", "Valeur", "Détails"],
          ["Temps moyen de résolution", avgResolutionTimeDisplay, "Objectif: 3 jours"],
          ["Taux de satisfaction utilisateur", `${satisfactionRate.toFixed(1)}%`, avgFeedback !== null ? `Note moyenne: ${avgFeedback.toFixed(1)}/5` : "Basé sur résolu/rejeté"],
          ["Tickets escaladés", escalatedTickets.toString(), "Critiques en cours"],
          ["Taux de réouverture", `${reopeningRate}%`, "Tickets rouverts après résolution"]
        ];
        
        autoTable(doc, {
          startY: yPos,
          head: [kpiData[0]],
          body: kpiData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [0, 123, 255] },
          styles: { fontSize: 10 }
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Volume de tickets - Ce mois
        doc.setFontSize(14);
        doc.text("Volume de tickets - Ce mois", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const volumeData = [
          ["Métrique", "Valeur", "Détails"],
          ["Total créés", thisMonthCreated.toString(), `vs mois dernier: ${createdChange}%`],
          ["Total résolus", thisMonthResolved.toString(), `Taux de résolution: ${resolutionRate}%`],
          ["En attente", thisMonthPending.toString(), `Nécessitent action: ${pendingRate}%`]
        ];
        
        autoTable(doc, {
          startY: yPos,
          head: [volumeData[0]],
          body: volumeData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [40, 167, 69] },
          styles: { fontSize: 10 }
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Performance par catégorie
        doc.setFontSize(14);
        doc.text("Performance par catégorie - Temps moyen", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const categoryData = [
          ["Catégorie", "Temps moyen (jours)", "Tickets traités"],
          ["Matériel", materielAvgDays + " jours", materielTickets.length.toString()],
          ["Applicatif", applicatifAvgDays + " jours", applicatifTickets.length.toString()]
        ];
        
        autoTable(doc, {
          startY: yPos,
          head: [categoryData[0]],
          body: categoryData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [124, 58, 237] },
          styles: { fontSize: 10 }
        });
        
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else if (selectedReport === "agence") {
        // Export spécifique pour Analyses par agence
        const doc = new jsPDF();
        let yPos = 20;
        
        // En-tête
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, yPos);
        yPos += 10;
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, yPos);
        yPos += 7;
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, yPos);
        yPos += 15;
        
        // Préparer les données des agences
        const agencies = Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)));
        const agencyData = agencies.map((agency) => {
          const agencyTickets = allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency);
          const resolvedAgencyTickets = agencyTickets.filter(t => t.status === "resolu" || t.status === "cloture");
          
          // Calculer le temps moyen de résolution (uniquement avec dates réelles)
          let totalResolutionTime = 0;
          let countWithDates = 0;
          
          resolvedAgencyTickets.forEach(ticket => {
            if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
              const created = new Date(ticket.created_at);
              const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
              const diffTime = resolved.getTime() - created.getTime();
              const diffDays = diffTime / (1000 * 60 * 60 * 24);
              if (diffDays >= 0) {
                totalResolutionTime += diffDays;
                countWithDates++;
              }
            }
          });
          
          const avgResolutionDays = countWithDates > 0 ? totalResolutionTime / countWithDates : 0;
          const avgResolutionDisplay = countWithDates > 0 
            ? avgResolutionDays % 1 === 0 
              ? `${Math.round(avgResolutionDays)} jour${Math.round(avgResolutionDays) > 1 ? 's' : ''}`
              : `${avgResolutionDays.toFixed(1)} jours`
            : "N/A";
          
          // Calculer la satisfaction
          const ticketsWithFeedback = resolvedAgencyTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
          let satisfactionDisplay = "N/A";
          
          if (ticketsWithFeedback.length > 0) {
            const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
            satisfactionDisplay = `${((avgFeedback / 5) * 100).toFixed(1)}%`;
          } else if (resolvedAgencyTickets.length > 0) {
            const rejectedAgencyTickets = agencyTickets.filter(t => t.status === "rejete");
            const resolvedCount = resolvedAgencyTickets.length;
            const rejectedCount = rejectedAgencyTickets.length;
            const totalProcessed = resolvedCount + rejectedCount;
            if (totalProcessed > 0) {
              const satisfactionRate = (resolvedCount / totalProcessed) * 100;
              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
            }
          }
          
          return {
            agence: agency,
            nombreTickets: agencyTickets.length,
            tempsMoyen: avgResolutionDisplay,
            satisfaction: satisfactionDisplay
          };
        }).sort((a, b) => b.nombreTickets - a.nombreTickets);
        
        // Tableau Volume de tickets par agence
        doc.setFontSize(14);
        doc.text("Volume de tickets par agence", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const agencyTableData = [
          ["Agence", "Nombre de tickets", "Temps moyen", "Satisfaction"]
        ];
        
        agencyData.forEach(agency => {
          agencyTableData.push([
            agency.agence || "N/A",
            agency.nombreTickets.toString(),
            agency.tempsMoyen,
            agency.satisfaction
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [agencyTableData[0]],
          body: agencyTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [0, 123, 255] },
          styles: { fontSize: 10 }
        });
        
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else if (selectedReport === "technicien") {
        // Export spécifique pour Analyses par technicien
        const doc = new jsPDF();
        let yPos = 20;
        
        // En-tête
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, yPos);
        yPos += 10;
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, yPos);
        yPos += 7;
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, yPos);
        yPos += 15;
        
        // Préparer les données des techniciens (identique au calcul dans l'interface)
        const technicianData = technicians.map((tech) => {
          const techTickets = allTickets.filter((t) => t.technician_id === tech.id);
          const inProgress = techTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours").length;
          const resolvedTickets = techTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
          
          // Calculer le temps moyen de résolution (uniquement avec dates réelles)
          let avgTimeDisplay = "N/A";
          if (resolvedTickets.length > 0) {
            let totalHours = 0;
            let countWithDates = 0;
            
            resolvedTickets.forEach((ticket) => {
              if (ticket.created_at) {
                const created = new Date(ticket.created_at);
                let resolvedDate: Date | null = null;
                
                if (ticket.status === "cloture" && ticket.closed_at) {
                  resolvedDate = new Date(ticket.closed_at);
                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                  resolvedDate = new Date(ticket.resolved_at);
                }
                
                if (resolvedDate) {
                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                  if (diffHours >= 0) {
                    totalHours += diffHours;
                    countWithDates++;
                  }
                }
              }
            });
            
            if (countWithDates > 0) {
              const avgHours = totalHours / countWithDates;
              if (avgHours < 24) {
                avgTimeDisplay = `${avgHours.toFixed(1)}h`;
              } else {
                const avgDays = avgHours / 24;
                avgTimeDisplay = `${avgDays.toFixed(1)}j`;
              }
            }
          }
          
          // Calculer la satisfaction
          let satisfactionDisplay = "N/A";
          if (resolvedTickets.length > 0) {
            const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined);
            
            if (ticketsWithFeedback.length > 0) {
              const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
              const satisfactionRate = (avgFeedback / 5) * 100;
              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
            } else {
              // Calculer satisfaction implicite basée sur le temps de résolution
              let totalSatisfaction = 0;
              let countSatisfaction = 0;
              
              resolvedTickets.forEach((ticket) => {
                if (ticket.created_at) {
                  const created = new Date(ticket.created_at);
                  let resolvedDate: Date | null = null;
                  
                  if (ticket.status === "cloture" && ticket.closed_at) {
                    resolvedDate = new Date(ticket.closed_at);
                  } else if (ticket.status === "resolu" && ticket.resolved_at) {
                    resolvedDate = new Date(ticket.resolved_at);
                  }
                  
                  if (resolvedDate) {
                    const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                    const diffDays = diffHours / 24;
                    
                    let satisfactionScore = 0;
                    if (ticket.priority === "haute" || ticket.priority === "critique") {
                      if (diffHours < 24) satisfactionScore = 100;
                      else if (diffHours < 48) satisfactionScore = 80;
                      else if (diffHours < 72) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    } else if (ticket.priority === "moyenne") {
                      if (diffDays < 3) satisfactionScore = 100;
                      else if (diffDays < 5) satisfactionScore = 80;
                      else if (diffDays < 7) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    } else {
                      if (diffDays < 7) satisfactionScore = 100;
                      else if (diffDays < 14) satisfactionScore = 80;
                      else if (diffDays < 21) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    }
                    
                    totalSatisfaction += satisfactionScore;
                    countSatisfaction++;
                  }
                }
              });
              
              if (countSatisfaction > 0) {
                const avgSatisfaction = totalSatisfaction / countSatisfaction;
                satisfactionDisplay = `${avgSatisfaction.toFixed(1)}%`;
              }
            }
          }
          
          return {
            technicien: tech.full_name,
            ticketsTraites: resolvedTickets.length,
            tempsMoyen: avgTimeDisplay,
            chargeActuelle: inProgress,
            satisfaction: satisfactionDisplay
          };
        });
        
        // Tableau Performance des techniciens
        doc.setFontSize(14);
        doc.text("Performance des techniciens", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const techTableData = [
          ["Technicien", "Tickets traités", "Temps moyen", "Charge actuelle", "Satisfaction"]
        ];
        
        technicianData.forEach(tech => {
          techTableData.push([
            tech.technicien,
            tech.ticketsTraites.toString(),
            tech.tempsMoyen,
            tech.chargeActuelle.toString(),
            tech.satisfaction
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [techTableData[0]],
          body: techTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [0, 123, 255] },
          styles: { fontSize: 10 }
        });
        
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else if (selectedReport === "evolutions") {
        // Export spécifique pour Évolutions dans le temps
        const doc = new jsPDF();
        let yPos = 20;
        
        // En-tête
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, yPos);
        yPos += 10;
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, yPos);
        yPos += 7;
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, yPos);
        yPos += 15;
        
        // Volume de tickets (30 derniers jours)
        doc.setFontSize(14);
        doc.text("Volume de tickets (30 derniers jours)", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const timeSeriesData = prepareTimeSeriesData();
        const timeSeriesTableData = [
          ["Date", "Créés", "Résolus"]
        ];
        timeSeriesData.forEach(item => {
          timeSeriesTableData.push([
            item.date,
            item.créés.toString(),
            item.résolus.toString()
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [timeSeriesTableData[0]],
          body: timeSeriesTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [0, 123, 255] },
          styles: { fontSize: 9 },
          pageBreak: 'auto'
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Évolution par statut (7 derniers jours)
        doc.setFontSize(14);
        doc.text("Évolution par statut (7 derniers jours)", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const statusEvolutionData = prepareStatusEvolutionData();
        const statusEvolutionTableData = [
          ["Date", "En attente", "En cours", "Résolus", "Clôturés"]
        ];
        statusEvolutionData.forEach(item => {
          statusEvolutionTableData.push([
            item.date,
            item['En attente'].toString(),
            item['En cours'].toString(),
            item['Résolus'].toString(),
            item['Clôturés'].toString()
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [statusEvolutionTableData[0]],
          body: statusEvolutionTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [40, 167, 69] },
          styles: { fontSize: 9 },
          pageBreak: 'auto'
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Répartition par priorité
        doc.setFontSize(14);
        doc.text("Répartition par priorité", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const priorityEvolutionData = preparePriorityEvolutionData();
        const priorityTableData = [
          ["Priorité", "Nombre"]
        ];
        priorityEvolutionData.forEach(item => {
          priorityTableData.push([
            item.priorité,
            item.nombre.toString()
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [priorityTableData[0]],
          body: priorityTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [124, 58, 237] },
          styles: { fontSize: 10 },
          pageBreak: 'auto'
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Pics d'activité (jours de la semaine)
        doc.setFontSize(14);
        doc.text("Pics d'activité (jours de la semaine)", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const dayOfWeekData = prepareDayOfWeekData();
        const dayTableData = [
          ["Jour", "Nombre de tickets"]
        ];
        dayOfWeekData.forEach(item => {
          dayTableData.push([
            item.jour,
            item.tickets.toString()
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [dayTableData[0]],
          body: dayTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [255, 193, 7] },
          styles: { fontSize: 10 },
          pageBreak: 'auto'
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Répartition par heure
        doc.setFontSize(14);
        doc.text("Répartition des tickets par heure de la journée", 14, yPos);
        yPos += 10;
        doc.setFontSize(11);
        
        const hourlyData = prepareHourlyData();
        const hourlyTableData = [
          ["Heure", "Nombre de tickets"]
        ];
        hourlyData.forEach(item => {
          hourlyTableData.push([
            item.heure,
            item.tickets.toString()
          ]);
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [hourlyTableData[0]],
          body: hourlyTableData.slice(1),
          theme: 'striped',
          headStyles: { fillColor: [23, 162, 184] },
          styles: { fontSize: 9 },
          pageBreak: 'auto'
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
        
        // Évolution de la satisfaction (si disponible)
        const satisfactionData = prepareSatisfactionData();
        if (satisfactionData.length > 0) {
          doc.setFontSize(14);
          doc.text("Évolution de la satisfaction utilisateur (7 derniers jours)", 14, yPos);
          yPos += 10;
          doc.setFontSize(11);
          
          const satisfactionTableData = [
            ["Date", "Satisfaction (sur 5)"]
          ];
          satisfactionData.forEach(item => {
            satisfactionTableData.push([
              item.date,
              item.satisfaction.toString()
            ]);
          });
          
          autoTable(doc, {
            startY: yPos,
            head: [satisfactionTableData[0]],
            body: satisfactionTableData.slice(1),
            theme: 'striped',
            headStyles: { fillColor: [220, 53, 69] },
            styles: { fontSize: 10 }
          });
        }
        
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else {
        // Export générique pour les autres rapports
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, 20);
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
        doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, 40);
        doc.save(`Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (error) {
      console.error("Erreur lors de l'export PDF:", error);
      alert("Erreur lors de l'export PDF");
    }
  };

  // Fonction générique pour exporter en Excel selon le type de rapport
  const exportToExcel = (reportType?: string) => {
    const reportName = getReportName(reportType);
    try {
      if (selectedReport === "recurrents") {
        exportProblemsHistoryToExcel(reportName);
      } else if (selectedReport === "statistiques") {
        // Export spécifique pour Statistiques générales
        const wb = XLSX.utils.book_new();
        
        // Feuille 1: Métriques principales
        const metricsData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Métriques principales'],
          ['Nombre total de tickets', allTickets.length],
          ['Tickets résolus/clôturés', resolvedCount + closedCount],
          ['']
        ];
        const metricsWs = XLSX.utils.aoa_to_sheet(metricsData);
        XLSX.utils.book_append_sheet(wb, metricsWs, sanitizeSheetName("Métriques"));
        
        // Feuille 2: Répartition par statut
        const statusData = [
          ['Statut', 'Nombre', 'Pourcentage'],
          ['En attente', pendingCount, allTickets.length > 0 ? ((pendingCount / allTickets.length) * 100).toFixed(1) + '%' : '0%'],
          ['Assignés/En cours', assignedCount, allTickets.length > 0 ? ((assignedCount / allTickets.length) * 100).toFixed(1) + '%' : '0%'],
          ['Résolus', resolvedCount, allTickets.length > 0 ? ((resolvedCount / allTickets.length) * 100).toFixed(1) + '%' : '0%'],
          ['Clôturés', closedCount, allTickets.length > 0 ? ((closedCount / allTickets.length) * 100).toFixed(1) + '%' : '0%'],
          ['Relancés', rejectedTickets.length, allTickets.length > 0 ? ((rejectedTickets.length / allTickets.length) * 100).toFixed(1) + '%' : '0%']
        ];
        const statusWs = XLSX.utils.aoa_to_sheet(statusData);
        XLSX.utils.book_append_sheet(wb, statusWs, sanitizeSheetName("Par statut"));
        
        // Feuille 3: Répartition par priorité
        const priorityData = [
          ['Priorité', 'Nombre', 'Pourcentage']
        ];
        ["critique", "haute", "moyenne", "faible"].forEach((priority) => {
          const count = allTickets.filter((t) => t.priority === priority).length;
          priorityData.push([
            priority.charAt(0).toUpperCase() + priority.slice(1),
            count.toString(),
            allTickets.length > 0 ? ((count / allTickets.length) * 100).toFixed(1) + '%' : '0%'
          ]);
        });
        const priorityWs = XLSX.utils.aoa_to_sheet(priorityData);
        XLSX.utils.book_append_sheet(wb, priorityWs, sanitizeSheetName("Par priorité"));
        
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else if (selectedReport === "metriques") {
        // Export spécifique pour Métriques de performance
        const wb = XLSX.utils.book_new();
        
        // Calculer les métriques principales (identique au calcul dans l'interface)
        const avgResolutionTimeDisplay = metrics.avgResolutionTime ?? "N/A";
        const resolvedTickets = allTickets.filter(t => t.status === "resolu" || t.status === "cloture");
        
        // Taux de satisfaction
        const ticketsWithFeedback = resolvedTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
        const avgFeedback = ticketsWithFeedback.length > 0 
          ? ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length
          : null;
        const rejectedTicketsRpt = allTickets.filter(t => t.status === "rejete");
        const resolvedCountRpt = resolvedTickets.length;
        const rejectedCountRpt = rejectedTicketsRpt.length;
        const denomRpt = resolvedCountRpt + rejectedCountRpt;
        let satisfactionRate = 0;
        if (avgFeedback !== null) {
          satisfactionRate = (avgFeedback / 5) * 100;
        } else if (denomRpt > 0) {
          satisfactionRate = (resolvedCountRpt / denomRpt) * 100;
        }
        
        // Tickets escaladés
        const escalatedTickets = allTickets.filter((t) => 
          t.priority === "critique" && 
          (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours")
        ).length;
        
        // Taux de réouverture
        const totalResolvedOrClosed = resolvedTickets.length;
        const reopeningRate = totalResolvedOrClosed > 0 
          ? ((reopenedTicketsCount / totalResolvedOrClosed) * 100).toFixed(1) 
          : "0.0";
        
        // Volume de tickets - Ce mois
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        const thisMonthTickets = allTickets.filter(t => {
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          return created >= currentMonthStart;
        });
        
        const lastMonthTickets = allTickets.filter(t => {
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          return created >= lastMonthStart && created <= lastMonthEnd;
        });
        
        const thisMonthResolved = thisMonthTickets.filter(t => t.status === "resolu" || t.status === "cloture").length;
        const thisMonthCreated = thisMonthTickets.length;
        const thisMonthPending = thisMonthTickets.filter(t => 
          t.status !== "resolu" && t.status !== "cloture" && t.status !== "rejete"
        ).length;
        
        const lastMonthCreated = lastMonthTickets.length;
        const createdChange = lastMonthCreated > 0 
          ? ((thisMonthCreated - lastMonthCreated) / lastMonthCreated * 100).toFixed(0)
          : "0";
        const resolutionRate = thisMonthCreated > 0 
          ? ((thisMonthResolved / thisMonthCreated) * 100).toFixed(0)
          : "0";
        const pendingRate = thisMonthCreated > 0 
          ? ((thisMonthPending / thisMonthCreated) * 100).toFixed(0)
          : "0";
        
        // Performance par catégorie
        const materielTickets = resolvedTickets.filter(t => t.type === "materiel");
        const applicatifTickets = resolvedTickets.filter(t => t.type === "applicatif");
        
        const calculateAvgTime = (tickets: Ticket[]) => {
          let total = 0;
          let count = 0;
          tickets.forEach(ticket => {
            // Ne compter que les tickets avec une date de création ET une date de résolution/clôture réelle
            if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
              const created = new Date(ticket.created_at);
              const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
              const diffDays = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
              // Ne compter que si le résultat est valide (différence positive)
              if (diffDays >= 0) {
                total += diffDays;
                count++;
              }
            }
          });
          return count > 0 ? (total / count).toFixed(1) : "0.0";
        };
        
        const materielAvgDays = calculateAvgTime(materielTickets);
        const applicatifAvgDays = calculateAvgTime(applicatifTickets);
        
        // Feuille 1: Indicateurs clés de performance
        const kpiData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Indicateurs clés de performance'],
          ['Indicateur', 'Valeur', 'Détails'],
          ['Temps moyen de résolution', avgResolutionTimeDisplay, 'Objectif: 3 jours'],
          ['Taux de satisfaction utilisateur', `${satisfactionRate.toFixed(1)}%`, avgFeedback !== null ? `Note moyenne: ${avgFeedback.toFixed(1)}/5` : 'Basé sur résolu/rejeté'],
          ['Tickets escaladés', escalatedTickets, 'Critiques en cours'],
          ['Taux de réouverture', `${reopeningRate}%`, 'Tickets rouverts après résolution']
        ];
        const kpiWs = XLSX.utils.aoa_to_sheet(kpiData);
        XLSX.utils.book_append_sheet(wb, kpiWs, sanitizeSheetName("KPIs"));
        
        // Feuille 2: Volume de tickets - Ce mois
        const volumeData = [
          ['Volume de tickets - Ce mois'],
          ['Métrique', 'Valeur', 'Détails'],
          ['Total créés', thisMonthCreated, `vs mois dernier: ${createdChange}%`],
          ['Total résolus', thisMonthResolved, `Taux de résolution: ${resolutionRate}%`],
          ['En attente', thisMonthPending, `Nécessitent action: ${pendingRate}%`]
        ];
        const volumeWs = XLSX.utils.aoa_to_sheet(volumeData);
        XLSX.utils.book_append_sheet(wb, volumeWs, sanitizeSheetName("Volume"));
        
        // Feuille 3: Performance par catégorie
        const categoryData = [
          ['Performance par catégorie - Temps moyen'],
          ['Catégorie', 'Temps moyen (jours)', 'Tickets traités'],
          ['Matériel', parseFloat(materielAvgDays), materielTickets.length],
          ['Applicatif', parseFloat(applicatifAvgDays), applicatifTickets.length]
        ];
        const categoryWs = XLSX.utils.aoa_to_sheet(categoryData);
        XLSX.utils.book_append_sheet(wb, categoryWs, sanitizeSheetName("Catégories"));
        
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else if (selectedReport === "agence") {
        // Export spécifique pour Analyses par agence
        const wb = XLSX.utils.book_new();
        
        // Préparer les données des agences
        const agencies = Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)));
        const agencyData = agencies.map((agency) => {
          const agencyTickets = allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency);
          const resolvedAgencyTickets = agencyTickets.filter(t => t.status === "resolu" || t.status === "cloture");
          
          // Calculer le temps moyen de résolution (uniquement avec dates réelles)
          let totalResolutionTime = 0;
          let countWithDates = 0;
          
          resolvedAgencyTickets.forEach(ticket => {
            if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
              const created = new Date(ticket.created_at);
              const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
              const diffTime = resolved.getTime() - created.getTime();
              const diffDays = diffTime / (1000 * 60 * 60 * 24);
              if (diffDays >= 0) {
                totalResolutionTime += diffDays;
                countWithDates++;
              }
            }
          });
          
          const avgResolutionDays = countWithDates > 0 ? totalResolutionTime / countWithDates : 0;
          const avgResolutionDisplay = countWithDates > 0 
            ? avgResolutionDays % 1 === 0 
              ? `${Math.round(avgResolutionDays)} jour${Math.round(avgResolutionDays) > 1 ? 's' : ''}`
              : `${avgResolutionDays.toFixed(1)} jours`
            : "N/A";
          
          // Calculer la satisfaction
          const ticketsWithFeedback = resolvedAgencyTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
          let satisfactionDisplay = "N/A";
          
          if (ticketsWithFeedback.length > 0) {
            const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
            satisfactionDisplay = `${((avgFeedback / 5) * 100).toFixed(1)}%`;
          } else if (resolvedAgencyTickets.length > 0) {
            const rejectedAgencyTickets = agencyTickets.filter(t => t.status === "rejete");
            const resolvedCount = resolvedAgencyTickets.length;
            const rejectedCount = rejectedAgencyTickets.length;
            const totalProcessed = resolvedCount + rejectedCount;
            if (totalProcessed > 0) {
              const satisfactionRate = (resolvedCount / totalProcessed) * 100;
              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
            }
          }
          
          return {
            agence: agency,
            nombreTickets: agencyTickets.length,
            tempsMoyen: avgResolutionDisplay,
            tempsMoyenJours: countWithDates > 0 ? avgResolutionDays : null,
            satisfaction: satisfactionDisplay
          };
        }).sort((a, b) => b.nombreTickets - a.nombreTickets);
        
        // Feuille: Volume de tickets par agence
        const agencyTableData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Volume de tickets par agence'],
          ['Agence', 'Nombre de tickets', 'Temps moyen', 'Satisfaction']
        ];
        
        agencyData.forEach(agency => {
          agencyTableData.push([
            agency.agence || "N/A",
            agency.nombreTickets.toString(),
            agency.tempsMoyen,
            agency.satisfaction
          ]);
        });
        
        const agencyWs = XLSX.utils.aoa_to_sheet(agencyTableData);
        XLSX.utils.book_append_sheet(wb, agencyWs, sanitizeSheetName("Par agence"));
        
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else if (selectedReport === "technicien") {
        // Export spécifique pour Analyses par technicien
        const wb = XLSX.utils.book_new();
        
        // Préparer les données des techniciens (identique au calcul dans l'interface)
        const technicianData = technicians.map((tech) => {
          const techTickets = allTickets.filter((t) => t.technician_id === tech.id);
          const inProgress = techTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours").length;
          const resolvedTickets = techTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
          
          // Calculer le temps moyen de résolution (uniquement avec dates réelles)
          let avgTimeDisplay = "N/A";
          if (resolvedTickets.length > 0) {
            let totalHours = 0;
            let countWithDates = 0;
            
            resolvedTickets.forEach((ticket) => {
              if (ticket.created_at) {
                const created = new Date(ticket.created_at);
                let resolvedDate: Date | null = null;
                
                if (ticket.status === "cloture" && ticket.closed_at) {
                  resolvedDate = new Date(ticket.closed_at);
                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                  resolvedDate = new Date(ticket.resolved_at);
                }
                
                if (resolvedDate) {
                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                  if (diffHours >= 0) {
                    totalHours += diffHours;
                    countWithDates++;
                  }
                }
              }
            });
            
            if (countWithDates > 0) {
              const avgHours = totalHours / countWithDates;
              if (avgHours < 24) {
                avgTimeDisplay = `${avgHours.toFixed(1)}h`;
              } else {
                const avgDays = avgHours / 24;
                avgTimeDisplay = `${avgDays.toFixed(1)}j`;
              }
            }
          }
          
          // Calculer la satisfaction
          let satisfactionDisplay = "N/A";
          if (resolvedTickets.length > 0) {
            const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined);
            
            if (ticketsWithFeedback.length > 0) {
              const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
              const satisfactionRate = (avgFeedback / 5) * 100;
              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
            } else {
              // Calculer satisfaction implicite basée sur le temps de résolution
              let totalSatisfaction = 0;
              let countSatisfaction = 0;
              
              resolvedTickets.forEach((ticket) => {
                if (ticket.created_at) {
                  const created = new Date(ticket.created_at);
                  let resolvedDate: Date | null = null;
                  
                  if (ticket.status === "cloture" && ticket.closed_at) {
                    resolvedDate = new Date(ticket.closed_at);
                  } else if (ticket.status === "resolu" && ticket.resolved_at) {
                    resolvedDate = new Date(ticket.resolved_at);
                  }
                  
                  if (resolvedDate) {
                    const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                    const diffDays = diffHours / 24;
                    
                    let satisfactionScore = 0;
                    if (ticket.priority === "haute" || ticket.priority === "critique") {
                      if (diffHours < 24) satisfactionScore = 100;
                      else if (diffHours < 48) satisfactionScore = 80;
                      else if (diffHours < 72) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    } else if (ticket.priority === "moyenne") {
                      if (diffDays < 3) satisfactionScore = 100;
                      else if (diffDays < 5) satisfactionScore = 80;
                      else if (diffDays < 7) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    } else {
                      if (diffDays < 7) satisfactionScore = 100;
                      else if (diffDays < 14) satisfactionScore = 80;
                      else if (diffDays < 21) satisfactionScore = 60;
                      else satisfactionScore = 40;
                    }
                    
                    totalSatisfaction += satisfactionScore;
                    countSatisfaction++;
                  }
                }
              });
              
              if (countSatisfaction > 0) {
                const avgSatisfaction = totalSatisfaction / countSatisfaction;
                satisfactionDisplay = `${avgSatisfaction.toFixed(1)}%`;
              }
            }
          }
          
          return {
            technicien: tech.full_name,
            ticketsTraites: resolvedTickets.length,
            tempsMoyen: avgTimeDisplay,
            chargeActuelle: inProgress,
            satisfaction: satisfactionDisplay
          };
        });
        
        // Feuille: Performance des techniciens
        const techTableData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Performance des techniciens'],
          ['Technicien', 'Tickets traités', 'Temps moyen', 'Charge actuelle', 'Satisfaction']
        ];
        
        technicianData.forEach(tech => {
          techTableData.push([
            tech.technicien,
            tech.ticketsTraites.toString(),
            tech.tempsMoyen,
            tech.chargeActuelle.toString(),
            tech.satisfaction
          ]);
        });
        
        const techWs = XLSX.utils.aoa_to_sheet(techTableData);
        XLSX.utils.book_append_sheet(wb, techWs, sanitizeSheetName("Techniciens"));
        
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else if (selectedReport === "evolutions") {
        // Export spécifique pour Évolutions dans le temps
        const wb = XLSX.utils.book_new();
        
        // Feuille 1: Volume de tickets (30 derniers jours)
        const timeSeriesData = prepareTimeSeriesData();
        const timeSeriesTableData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Volume de tickets (30 derniers jours)'],
          ['Date', 'Créés', 'Résolus']
        ];
        timeSeriesData.forEach(item => {
          timeSeriesTableData.push([
            item.date,
            item.créés.toString(),
            item.résolus.toString()
          ]);
        });
        const timeSeriesWs = XLSX.utils.aoa_to_sheet(timeSeriesTableData);
        XLSX.utils.book_append_sheet(wb, timeSeriesWs, sanitizeSheetName("Volume 30j"));
        
        // Feuille 2: Évolution par statut (7 derniers jours)
        const statusEvolutionData = prepareStatusEvolutionData();
        const statusEvolutionTableData = [
          ['Évolution par statut (7 derniers jours)'],
          ['Date', 'En attente', 'En cours', 'Résolus', 'Clôturés']
        ];
        statusEvolutionData.forEach(item => {
          statusEvolutionTableData.push([
            item.date,
            item['En attente'].toString(),
            item['En cours'].toString(),
            item['Résolus'].toString(),
            item['Clôturés'].toString()
          ]);
        });
        const statusEvolutionWs = XLSX.utils.aoa_to_sheet(statusEvolutionTableData);
        XLSX.utils.book_append_sheet(wb, statusEvolutionWs, sanitizeSheetName("Par statut"));
        
        // Feuille 3: Répartition par priorité
        const priorityEvolutionData = preparePriorityEvolutionData();
        const priorityTableData = [
          ['Répartition par priorité'],
          ['Priorité', 'Nombre']
        ];
        priorityEvolutionData.forEach(item => {
          priorityTableData.push([
            item.priorité,
            item.nombre.toString()
          ]);
        });
        const priorityWs = XLSX.utils.aoa_to_sheet(priorityTableData);
        XLSX.utils.book_append_sheet(wb, priorityWs, sanitizeSheetName("Par priorité"));
        
        // Feuille 4: Pics d'activité (jours de la semaine)
        const dayOfWeekData = prepareDayOfWeekData();
        const dayTableData = [
          ["Pics d'activité (jours de la semaine)"],
          ['Jour', 'Nombre de tickets']
        ];
        dayOfWeekData.forEach(item => {
          dayTableData.push([
            item.jour,
            item.tickets.toString()
          ]);
        });
        const dayWs = XLSX.utils.aoa_to_sheet(dayTableData);
        XLSX.utils.book_append_sheet(wb, dayWs, sanitizeSheetName("Jours semaine"));
        
        // Feuille 5: Répartition par heure
        const hourlyData = prepareHourlyData();
        const hourlyTableData = [
          ['Répartition des tickets par heure de la journée'],
          ['Heure', 'Nombre de tickets']
        ];
        hourlyData.forEach(item => {
          hourlyTableData.push([
            item.heure,
            item.tickets.toString()
          ]);
        });
        const hourlyWs = XLSX.utils.aoa_to_sheet(hourlyTableData);
        XLSX.utils.book_append_sheet(wb, hourlyWs, sanitizeSheetName("Par heure"));
        
        // Feuille 6: Évolution de la satisfaction (si disponible)
        const satisfactionData = prepareSatisfactionData();
        if (satisfactionData.length > 0) {
          const satisfactionTableData = [
            ['Évolution de la satisfaction utilisateur (7 derniers jours)'],
            ['Date', 'Satisfaction (sur 5)']
          ];
          satisfactionData.forEach(item => {
            satisfactionTableData.push([
              item.date,
              item.satisfaction.toString()
            ]);
          });
          const satisfactionWs = XLSX.utils.aoa_to_sheet(satisfactionTableData);
          XLSX.utils.book_append_sheet(wb, satisfactionWs, sanitizeSheetName("Satisfaction"));
        }
        
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else {
        // Export générique pour les autres rapports
        const wb = XLSX.utils.book_new();
        const wsData = [
          ['Rapport', reportName],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Note: Les données détaillées seront disponibles dans une prochaine version.']
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Rapport"));
        XLSX.writeFile(wb, `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
    } catch (error) {
      console.error("Erreur lors de l'export Excel:", error);
      alert("Erreur lors de l'export Excel");
    }
  };

  // Fonction générique pour voir le rapport détaillé
  const viewDetailedReport = (reportType?: string) => {
    const reportName = getReportName(reportType);
    if (selectedReport === "recurrents") {
      const problems = getRecurringTicketsHistory();
      const mostFrequent = getMostFrequentProblems();
      const problematicApps = getProblematicApplications();
      
      let reportContent = `RAPPORT: ${reportName}\n`;
      reportContent += `Date de génération: ${new Date().toLocaleDateString('fr-FR')}\n`;
      reportContent += `Date de génération (heure): ${new Date().toLocaleTimeString('fr-FR')}\n\n`;
      
      reportContent += "=".repeat(80) + "\n";
      reportContent += "HISTORIQUE DES PROBLÈMES\n";
      reportContent += "=".repeat(80) + "\n\n";
      
      if (problems.length > 0) {
        problems.forEach((item, index) => {
          reportContent += `${index + 1}. ${item.titre}\n`;
          reportContent += `   Occurrences: ${item.occurrences}\n`;
          reportContent += `   Dernière occurrence: ${item.dernier ? new Date(item.dernier).toLocaleDateString('fr-FR') : 'N/A'}\n\n`;
        });
      } else {
        reportContent += "Aucun problème récurrent dans l'historique.\n\n";
      }
      
      reportContent += "=".repeat(80) + "\n";
      reportContent += "PROBLÈMES LES PLUS FRÉQUENTS\n";
      reportContent += "=".repeat(80) + "\n\n";
      
      if (mostFrequent.length > 0) {
        mostFrequent.forEach((item, index) => {
          reportContent += `${index + 1}. ${item.problème}\n`;
          reportContent += `   Occurrences: ${item.occurrences}\n\n`;
        });
      } else {
        reportContent += "Aucun problème fréquent identifié.\n\n";
      }
      
      reportContent += "=".repeat(80) + "\n";
      reportContent += "APPLICATIONS/ÉQUIPEMENTS PROBLÉMATIQUES\n";
      reportContent += "=".repeat(80) + "\n\n";
      
      if (problematicApps.length > 0) {
        problematicApps.forEach((item, index) => {
          reportContent += `${index + 1}. ${item.application}\n`;
          reportContent += `   Nombre de tickets: ${item.tickets}\n\n`;
        });
      } else {
        reportContent += "Aucune application ou équipement problématique identifié.\n\n";
      }
      
      // Afficher le rapport dans une nouvelle fenêtre
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>Rapport: ${reportName}</title>
              <style>
                body { font-family: monospace; padding: 20px; white-space: pre-wrap; }
                h1 { color: #1e3a5f; }
              </style>
            </head>
            <body>
              <h1>Rapport: ${reportName}</h1>
              <pre>${reportContent}</pre>
            </body>
          </html>
        `);
        newWindow.document.close();
      }
    } else {
      // Afficher un rapport générique pour les autres types
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>Rapport: ${reportName}</title>
              <style>
                body { font-family: monospace; padding: 20px; white-space: pre-wrap; }
                h1 { color: #1e3a5f; }
              </style>
            </head>
            <body>
              <h1>Rapport: ${reportName}</h1>
              <pre>RAPPORT: ${reportName}
Date de génération: ${new Date().toLocaleDateString('fr-FR')}
Heure de génération: ${new Date().toLocaleTimeString('fr-FR')}

Ce rapport est actuellement en cours de développement.
Les données détaillées seront disponibles dans une prochaine version.</pre>
            </body>
          </html>
        `);
        newWindow.document.close();
      }
    }
  };

  // Récupérer toutes les agences uniques
  const allAgencies = Array.from(new Set(
    allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)
  ));

  // Filtrer les tickets selon les filtres sélectionnés
  let filteredTickets = allTickets;
  
  if (statusFilter !== "all") {
    if (statusFilter === "en_traitement") {
      filteredTickets = filteredTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours");
    } else {
      filteredTickets = filteredTickets.filter((t) => t.status === statusFilter);
    }
  }
  
  if (agencyFilter !== "all") {
    filteredTickets = filteredTickets.filter((t) => {
      const agency = t.creator?.agency || t.user_agency;
      return agency === agencyFilter;
    });
  }
  
  if (priorityFilter !== "all") {
    filteredTickets = filteredTickets.filter((t) => t.priority === priorityFilter);
  }
  
  // Filtre par délégation (UNIQUEMENT les tickets délégués par le DSI connecté)
  if (delegationFilter !== "all" && userRole === "DSI") {
    if (delegationFilter === "delegated") {
      // Filtrer uniquement les tickets délégués par le DSI connecté
      filteredTickets = filteredTickets.filter((t) => delegatedTicketsByMe.has(t.id));
    } else if (delegationFilter === "not_delegated") {
      // Filtrer les tickets non délégués OU délégués par quelqu'un d'autre
      filteredTickets = filteredTickets.filter((t) => !delegatedTicketsByMe.has(t.id));
    }
  } else if (delegationFilter !== "all" && userRole !== "DSI") {
    // Pour les autres rôles, utiliser la logique basée sur secretary_id
    if (delegationFilter === "delegated") {
      filteredTickets = filteredTickets.filter((t) => t.secretary_id !== null && t.secretary_id !== undefined);
    } else if (delegationFilter === "not_delegated") {
      filteredTickets = filteredTickets.filter((t) => t.secretary_id === null || t.secretary_id === undefined);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: "#f5f5f5", overflowX: "visible" }}>
      <style>{`
        #dsi-sidebar::-webkit-scrollbar {
          display: none;
        }
        #dsi-sidebar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      {/* Sidebar */}
      <div 
        id="dsi-sidebar"
        style={{ 
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
                : "D"}
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
                {userInfo.role?.name || userRole || "DSI"}
              </div>
            </div>
          </div>
        )}
        
        <div 
          onClick={() => navigate("/dashboard/dsi")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: activeSection === "dashboard" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={20} color={activeSection === "dashboard" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tableau de Bord</div>
        </div>
        
        <div 
          onClick={() => {
            setStatusFilter("all");
            navigate("/dashboard/dsi/tickets");
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            cursor: "pointer",
            color: "white",
            borderRadius: "4px",
            background: activeSection === "tickets" ? "hsl(25, 95%, 53%)" : "transparent",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={activeSection === "tickets" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="4" rx="1" />
              <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="16" y2="14" />
              <line x1="8" y1="18" x2="12" y2="18" />
            </svg>
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tickets</div>
        </div>
        {userRole === "Admin" && (
          <div 
            onClick={() => {
              navigate("/dashboard/dsi/actifs");
            }}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "10px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "actifs" ? "hsl(25, 95%, 53%)" : "transparent",
              marginBottom: "8px"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Box size={18} color={activeSection === "actifs" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2} />
            </div>
            <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Actifs</div>
          </div>
        )}
        {userRole !== "Admin" && (
          <div 
            onClick={() => navigate("/dashboard/dsi/technicians")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "10px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "technicians" ? "hsl(25, 95%, 53%)" : "transparent",
              marginBottom: "8px"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color={activeSection === "technicians" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Équipe</div>
          </div>
        )}
        {userRole === "Admin" && (
          <div 
            onClick={() => navigate("/dashboard/dsi/users")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "10px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "users" ? "hsl(25, 95%, 53%)" : "transparent",
              marginBottom: "8px"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={activeSection === "users" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>Utilisateurs</div>
          </div>
        )}
        <div 
          onClick={() => {
            setSelectedReport("statistiques");
            navigate("/dashboard/dsi/reports");
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "12px", 
            background: activeSection === "reports" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BarChart3 size={20} color={activeSection === "reports" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1 }}>Statistiques</div>
        </div>
        {userRole === "Admin" && (
          <div 
            onClick={() => navigate("/dashboard/dsi/maintenance")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "maintenance" ? "hsl(25, 95%, 53%)" : "transparent"
            }}
          >
            <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
              </svg>
            </div>
            <div style={{ flex: 1 }}>Maintenance</div>
          </div>
        )}
        {userRole === "Admin" && (
          <div 
            onClick={() => navigate("/dashboard/dsi/audit-logs")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "audit-logs" ? "hsl(25, 95%, 53%)" : "transparent"
            }}
          >
            <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
            </div>
            <div style={{ flex: 1 }}>Audit et Logs</div>
          </div>
        )}
        {userRole === "Admin" && (
          <div>
            <div
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                padding: "12px 16px", 
                cursor: "pointer",
                color: "white",
                borderRadius: "4px",
                background: activeSection === "settings" ? "hsl(25, 95%, 53%)" : "transparent"
              }}
            >
              <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1.5 L13.2 5.5 L17.2 4.5 L15.2 8.2 L19 9.5 L16.5 12 L19 14.5 L15.2 15.8 L17.2 19.5 L13.2 18.5 L12 22.5 L10.8 18.5 L6.8 19.5 L8.8 15.8 L5 14.5 L7.5 12 L5 9.5 L8.8 8.2 L6.8 4.5 L10.8 5.5 Z"/>
                  <circle cx="12" cy="12" r="3" fill="none"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>Paramètres</div>
              <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {showSettingsDropdown ? (
                    <polyline points="6 9 12 15 18 9" />
                  ) : (
                    <polyline points="9 18 15 12 9 6" />
                  )}
                </svg>
              </div>
            </div>
            {showSettingsDropdown && (
              <div style={{ 
                marginLeft: "48px", 
                marginTop: "8px", 
                marginBottom: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <div
                  onClick={() => setActiveSection("apparence")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "apparence" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Apparence
                </div>
                <div
                  onClick={() => setActiveSection("email")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "email" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Email
                </div>
                <div
                  onClick={() => setActiveSection("securite")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "securite" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Sécurité
                </div>
                <div
                  onClick={() => setActiveSection("types-tickets")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "types-tickets" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Types de Tickets
                </div>
                <div
                  onClick={() => setActiveSection("priorites")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "priorites" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Priorités
                </div>
                <div
                  onClick={() => setActiveSection("departements")}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    color: "white",
                    borderRadius: "4px",
                    background: activeSection === "departements" ? "hsl(25, 95%, 53%)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Départements
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section Notifications + Déconnexion en bas */}
        <div style={{ marginTop: "auto" }}>
          {/* Bouton Notifications */}
          <div
            onClick={() => navigate("/dashboard/dsi/notifications")}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          borderBottom: "1px solid #e5e7eb",
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
              {activeSection === "tickets" ? "Tickets" : activeSection === "technicians" ? "Équipe" : activeSection === "reports" ? "Statistiques générales" : "Tableau de bord"}
            </div>
            <div style={{ 
              fontSize: "13px", 
              fontWeight: "400",
              color: "#6b7280",
              fontFamily: "system-ui, -apple-system, sans-serif"
            }}>
              {activeSection === "tickets" ? "Gérez tous vos tickets" : activeSection === "technicians" ? "Gestion des membres de l'équipe DSI et des techniciens" : activeSection === "reports" ? "Vue d'ensemble des tickets et de l'activité du support" : "Vue d'ensemble de votre activité"}
            </div>
          </div>
          
          {/* Right side - Icons */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          
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

          {/* Icône boîte de réception - tickets à assigner */}
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
              opacity: pendingCount > 0 ? 1 : 0.5,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="6" width="16" height="12" rx="1" />
              <circle cx="4" cy="10" r="1" fill="#000000" />
              <circle cx="4" cy="14" r="1" fill="#000000" />
              <circle cx="20" cy="10" r="1" fill="#000000" />
              <circle cx="20" cy="14" r="1" fill="#000000" />
            </svg>
            {pendingCount > 0 && (
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
                {pendingCount > 99 ? "99+" : pendingCount}
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
                Retour aux tickets
              </button>
              <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#111827", marginBottom: "8px" }}>
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
                          <div style={{ marginTop: "4px", color: "#666" }}>Résumé de la résolution: {h.reason}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Actions disponibles pour le DSI */}
              <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                <strong>Actions :</strong>
                <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {/* Bouton Assigner */}
                  {ticketDetails.status === "en_attente_analyse" && (
                    <button
                      onClick={() => {
                        handleAssignClick(ticketDetails.id);
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: loading ? "#d1d5db" : "#f3f4f6",
                        color: "black",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        opacity: loading ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#e5e7eb";
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                    >
                      <UserPlus size={16} />
                      Assigner
                    </button>
                  )}

                  {/* Bouton Déléguer à un adjoint */}
                  {userRole === "DSI" && ticketDetails.status === "en_attente_analyse" && (
                    <button
                      onClick={() => {
                        handleDelegateClick(ticketDetails.id);
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: loading ? "#d1d5db" : "#f3f4f6",
                        color: "black",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        opacity: loading ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#e5e7eb";
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                    >
                      <CornerUpRight size={16} />
                      Déléguer à un adjoint
                    </button>
                  )}

                  {/* Bouton Escalader */}
                  {userRole === "DSI" && ticketDetails.status === "en_attente_analyse" && (
                    <button
                      onClick={() => {
                        handleEscalate(ticketDetails.id);
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: loading ? "#d1d5db" : "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        opacity: loading ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#d97706";
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#f59e0b";
                      }}
                    >
                      Escalader
                    </button>
                  )}

                  {/* Bouton Réassigner (si assigné ou en cours) */}
                  {(ticketDetails.status === "assigne_technicien" || ticketDetails.status === "en_cours") && (
                    <button
                      onClick={() => {
                        handleReassignClick(ticketDetails.id);
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: loading ? "#d1d5db" : "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        opacity: loading ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#059669";
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#10b981";
                      }}
                    >
                      Réassigner
                    </button>
                  )}

                  {/* Bouton Rouvrir (si relancé) */}
                  {ticketDetails.status === "rejete" && (
                    <button
                      onClick={() => {
                        handleReopenClick(ticketDetails.id);
                      }}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: loading ? "#d1d5db" : "#f3f4f6",
                        color: "black",
                        border: "none",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        opacity: loading ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                      onMouseEnter={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#e5e7eb";
                      }}
                      onMouseLeave={(e) => {
                        if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                      }}
                    >
                      Rouvrir
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
          {activeSection === "dashboard" && (
            <>
      {/* En-tête tableau de bord DSI */}
      <div style={{ marginTop: "32px", marginBottom: "20px" }}>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
          Tableau de bord DSI 🎯
        </div>
        <div style={{ fontSize: "15px", color: "#4b5563" }}>
          Vue d'ensemble des tickets et de l'équipe
        </div>
      </div>

      {/* Métriques principales DSI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(200px, 1fr))",
          gap: "10px",
          margin: "20px 0",
        }}
      >
        {/* Tickets à assigner */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#fff4e6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock3 size={20} color="#ff8a3c" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {pendingCount}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Tickets à assigner
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#6b7280" }}>
            Action requise
          </div>
        </div>

        {/* Techniciens disponibles */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#e6fff3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserCheck size={20} color="#16a34a" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {activeTechniciansCount}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Techniciens disponibles
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#6b7280" }}>
            Sur {technicians.length || 0} au total
          </div>
        </div>

        {/* Temps moyen */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#f4e9ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock3 size={20} color="#8b5cf6" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {metrics.avgResolutionTime ?? "Chargement..."}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Temps moyen
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#16a34a" }}>
            {/* Variation fictive pour l&apos;instant */}
            ↗ -15% ce mois
          </div>
        </div>

        {/* Satisfaction client (en %) */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#fff8db",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Star size={20} color="#eab308" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {metrics.userSatisfaction ?? "Chargement..."}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Satisfaction client
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#16a34a" }}>
            {/* Variation fictive pour l&apos;instant */}
            ↗ +0.3 ce mois
          </div>
        </div>

        {/* Volume total de tickets */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#e0f7ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock3 size={20} color="#0284c7" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {totalTicketsCount}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Volume total
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#6b7280" }}>
            Ce mois
          </div>
        </div>

        {/* Taux de résolution global */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1.5)";
          }}
          onMouseLeave={(e) => {
            const badge = e.currentTarget.querySelector('.kpi-badge') as HTMLElement;
            if (badge) badge.style.transform = "scale(1)";
          }}
        >
          <div
            className="kpi-badge"
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
              position: "absolute",
              right: "16px",
              top: "16px",
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "hsla(142, 76%, 85%, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUp size={20} color="hsl(142, 76%, 36%)" />
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "4px",
            }}
          >
            {resolutionRate}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>
            Taux de résolution
          </div>
          <div style={{ marginTop: "3px", fontSize: "11px", color: "#16a34a" }}>
            +2% (indicatif)
          </div>
        </div>
      </div>

      {/* Section Tickets Récents pour DSI */}
      {userRole === "DSI" && (
        <>
          {/* Tableau des tickets récents */}
          <h3 style={{ marginTop: "32px", marginBottom: "12px", fontSize: "22px", fontWeight: "600", color: "#333" }}>
            Tickets Récents
          </h3>
          {/* Tickets Cards */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              overflow: "visible",
            }}
          >
            {(() => {
              // Appliquer les filtres puis trier les tickets par date de création (plus récents en premier) et prendre les 5 premiers
              let recentFilteredTickets = [...filteredTickets]
                .sort((a, b) => {
                  const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return dateB - dateA; // Tri décroissant (plus récent en premier)
                })
                .slice(0, 5); // Prendre les 5 premiers
              
              const recentTickets = recentFilteredTickets;

              if (recentTickets.length === 0) {
                return (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "40px", 
                    color: "#999", 
                    fontWeight: "500",
                    background: "white",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}>
                    Aucun ticket
                  </div>
                );
              }

              return recentTickets.map((t) => {
                // Fonction helper pour obtenir les initiales
                const getInitials = (name: string) => {
                  if (!name) return "??";
                  const parts = name.split(" ");
                  if (parts.length >= 2) {
                    return (parts[0][0] + parts[1][0]).toUpperCase();
                  }
                  return name.substring(0, 2).toUpperCase();
                };

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

                // Couleur de la barre selon la priorité
                const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                   t.priority === "haute" ? "#F59E0B" : 
                                   t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                   "#0DADDB";

                // Déterminer le type de ticket basé sur la catégorie
                const category = t.category || "";
                const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                    category.toLowerCase().includes("applicatif") ||
                                    category.toLowerCase().includes("application");
                const categoryType = isApplicatif ? "Applicatif" : "Matériel";

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
                          background: t.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : 
                                     t.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : 
                                     t.status === "en_cours" ? "rgba(15, 31, 61, 0.1)" : 
                                     t.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : 
                                     t.status === "rejete" ? "#fee2e2" : 
                                     t.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                          color: t.status === "en_attente_analyse" ? "#0DADDB" : 
                                 t.status === "assigne_technicien" ? "#FF7A1B" : 
                                 t.status === "en_cours" ? "#0F1F3D" : 
                                 t.status === "resolu" ? "#2F9E44" : 
                                 t.status === "rejete" ? "#991b1b" : 
                                 t.status === "cloture" ? "#374151" : "#374151",
                          whiteSpace: "nowrap",
                        }}>
                          {t.status === "en_attente_analyse" ? "En attente d'assignation" :
                           t.status === "assigne_technicien" ? "Assigné" :
                           t.status === "en_cours" ? "En cours" :
                           t.status === "resolu" ? "Résolu" :
                           t.status === "rejete" ? "Relancé" :
                           t.status === "cloture" ? "Clôturé" : t.status}
                        </span>

                        {/* Badge Priorité */}
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "20px",
                          fontSize: "10px",
                          fontWeight: "500",
                          background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : 
                                     t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : 
                                     t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : 
                                     t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                          color: t.priority === "critique" ? "#E53E3E" : 
                                 t.priority === "haute" ? "#F59E0B" : 
                                 t.priority === "moyenne" ? "#0DADDB" : 
                                 t.priority === "faible" ? "#6B7280" : "#374151",
                          whiteSpace: "nowrap",
                        }}>
                          {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                        </span>

                        {/* Badge Catégorie */}
                        {t.category && (
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
                            {isApplicatif ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                <line x1="8" y1="21" x2="16" y2="21"></line>
                                <line x1="12" y1="17" x2="12" y2="21"></line>
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                              </svg>
                            )}
                            <span>{categoryType}</span>
                          </span>
                        )}
                      </div>

                      {/* Menu 3 points ou icône œil (pour clôturé) */}
                      <div style={{ position: "relative" }}>
                        {t.status === "cloture" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadTicketDetails(t.id);
                            }}
                            style={{
                              background: "#6b7280",
                              border: "1px solid white",
                              borderRadius: "6px",
                              cursor: "pointer",
                              padding: "6px 8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "32px",
                              height: "32px"
                            }}
                            title="Voir les détails"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                        ) : (
                          <>
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
                                const viewportHeight = window.innerHeight;
                                const menuWidth = 220;
                                const menuHeight = 220;

                                let top = buttonRect.bottom + 4;
                                if (viewportHeight - buttonRect.bottom < menuHeight && buttonRect.top > menuHeight) {
                                  top = buttonRect.top - menuHeight - 4;
                                }

                                let left = buttonRect.right - menuWidth;
                                if (left < 8) left = 8;

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
                          </>
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

                    {/* Pied de carte : Créateur, Date, Agence, Assigné */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                            {t.creator?.full_name || "N/A"}
                          </span>
                        </div>

                        {/* Séparateur */}
                        <span style={{ color: "#d1d5db" }}>•</span>

                        {/* Date relative */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span style={{ fontSize: "12px", color: "#6b7280" }}>
                            {t.created_at ? getRelativeTime(t.created_at) : "N/A"}
                          </span>
                        </div>

                        {/* Séparateur */}
                        <span style={{ color: "#d1d5db" }}>•</span>

                        {/* Agence */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                          </svg>
                          <span style={{ fontSize: "12px", color: "#6b7280" }}>
                            {t.creator ? (t.creator.agency || t.user_agency || "N/A") : (t.user_agency || "N/A")}
                          </span>
                        </div>

                        {/* Flèche + Technicien assigné si présent */}
                        {t.technician?.full_name && (
                          <>
                            {/* Flèche */}
                            <span style={{ color: "#d1d5db" }}>→</span>

                            {/* Avatar + Nom technicien */}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                background: "rgba(250, 124, 21, 0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "10px",
                                fontWeight: "600",
                                color: "#FA7C15",
                                fontFamily: "Inter, system-ui, sans-serif",
                              }}>
                                {getInitials(t.technician.full_name)}
                              </div>
                              <span style={{ 
                                fontSize: "12px", 
                                color: "#0E1424", 
                                fontWeight: "500",
                                fontFamily: "Inter, system-ui, sans-serif",
                              }}>
                                {t.technician.full_name}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Espace vide pour l'alignement si besoin */}
                      {!t.technician?.full_name && (
                        <div></div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {/* Vue d'ensemble globale - Graphiques pour l'administrateur */}
      {userRole === "Admin" && (
      <div style={{ marginTop: "32px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
          Vue d'ensemble de l'application
        </h2>
        <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "24px" }}>
          Synthèse globale de l'activité : volumes, statuts, priorités, agences, types et rythmes de création
        </p>

        {/* Ligne 1 : Volume dans le temps + Répartition par statut */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.5fr)", gap: "24px", marginBottom: "24px" }}>
          {/* Volume de tickets (30 jours) */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Volume de tickets (30 derniers jours)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={prepareTimeSeriesData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: "12px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
        borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="créés"
                  name="Créés"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="résolus"
                  name="Résolus"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
        </div>

          {/* Répartition par statut */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Répartition par statut
            </h3>
            {(() => {
              const statusData = [
                { name: "En attente", value: allTickets.filter((t) => t.status === "en_attente_analyse").length, color: "#f97316" },
                { name: "Assignés / En cours", value: allTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours").length, color: "#3b82f6" },
                { name: "Résolus", value: allTickets.filter((t) => t.status === "resolu").length, color: "#22c55e" },
                { name: "Clôturés", value: allTickets.filter((t) => t.status === "cloture").length, color: "#facc15" },
                { name: "Relancés", value: allTickets.filter((t) => t.status === "rejete").length, color: "#ef4444" }
              ].filter(item => item.value > 0);

              return statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-status-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) =>
                        [`${value} ticket(s)`, props.payload.name]
                      }
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
        </div>
              );
            })()}
        </div>
      </div>

        {/* Ligne 2 : Priorités + Types (Matériel/Applicatif) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "24px", marginBottom: "24px" }}>
          {/* Répartition par priorité */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Répartition par priorité
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={preparePriorityEvolutionData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="priorité" stroke="#6b7280" style={{ fontSize: "12px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                />
                <Legend />
                <Bar dataKey="nombre" radius={[8, 8, 0, 0]}>
                  {preparePriorityEvolutionData().map((entry, index) => {
                    const priorityColors: { [key: string]: string } = {
                      'Critique': '#E53E3E',
                      'Haute': '#F59E0B',
                      'Moyenne': '#0DADDB',
                      'Faible': '#6b7280'
                    };
                    return <Cell key={`cell-priority-${index}`} fill={priorityColors[entry.priorité] || '#3b82f6'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Répartition par type (Matériel/Applicatif) */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Répartition par type
            </h3>
            {(() => {
              const typeData = [
                { name: "Matériel", value: allTickets.filter((t) => t.type === "materiel").length, color: "#8b5cf6" },
                { name: "Applicatif", value: allTickets.filter((t) => t.type === "applicatif").length, color: "#06b6d4" }
              ].filter(item => item.value > 0);

              return typeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={typeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                    >
                      {typeData.map((entry, index) => (
                        <Cell key={`cell-type-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) =>
                        [`${value} ticket(s)`, props.payload.name]
                      }
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
            })()}
          </div>
        </div>

        {/* Ligne 3 : Agences + Jours de la semaine */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: "24px", marginBottom: "24px" }}>
          {/* Tickets par agence */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Tickets par agence
            </h3>
            {(() => {
              const agencyData = prepareAgencyData().slice(0, 10); // Top 10 agences
              return agencyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={agencyData} 
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" style={{ fontSize: "12px" }} />
                    <YAxis dataKey="agence" type="category" stroke="#6b7280" style={{ fontSize: "12px" }} width={90} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="tickets" 
                      radius={[0, 8, 8, 0]}
                      fill="#4b5563"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
            })()}
          </div>

          {/* Pics d'activité par jour */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Pics d'activité (jours de la semaine)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prepareDayOfWeekData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="jour" stroke="#6b7280" style={{ fontSize: "12px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                />
                <Legend />
                <Bar dataKey="tickets" radius={[8, 8, 0, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ligne 4 : Évolution par statut (7 derniers jours) */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Évolution par statut (7 derniers jours)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={prepareStatusEvolutionData()}>
                <defs>
                  <linearGradient id="colorEnAttente" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorEnCours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorResolus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorClotures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#facc15" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#facc15" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: "12px" }} />
                <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                            border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="En attente" stackId="1" stroke="#f97316" fill="url(#colorEnAttente)" />
                <Area type="monotone" dataKey="En cours" stackId="1" stroke="#3b82f6" fill="url(#colorEnCours)" />
                <Area type="monotone" dataKey="Résolus" stackId="1" stroke="#22c55e" fill="url(#colorResolus)" />
                <Area type="monotone" dataKey="Clôturés" stackId="1" stroke="#facc15" fill="url(#colorClotures)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ligne 5 : Utilisateurs par rôle + Techniciens par spécialisation */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "24px", marginBottom: "24px" }}>
          {/* Répartition des utilisateurs par rôle */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Répartition des utilisateurs par rôle
            </h3>
            {(() => {
              const roleData = prepareUsersByRoleData();
              return roleData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={roleData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      dataKey="nombre"
                      nameKey="rôle"
                    >
                      {roleData.map((entry, index) => {
                        const roleColors: { [key: string]: string } = {
                          'Admin': '#ef4444',
                          'DSI': '#3b82f6',
                          'Secrétaire': '#22c55e',
                          'Adjoint DSI': '#f97316',
                          'Technicien': '#8b5cf6',
                          'Utilisateur': '#6b7280',
                          'Sans rôle': '#9ca3af'
                        };
                        return <Cell key={`cell-role-${index}`} fill={roleColors[entry.rôle] || '#9ca3af'} />;
                      })}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) =>
                        [`${value} utilisateur(s)`, props.payload.rôle]
                      }
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
            })()}
          </div>

          {/* Répartition des techniciens par spécialisation */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Répartition des techniciens par spécialisation
            </h3>
            {(() => {
              const specData = prepareTechniciansBySpecializationData();
              return specData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={specData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      dataKey="nombre"
                      nameKey="spécialisation"
                    >
                      {specData.map((entry, index) => {
                        const specColors: { [key: string]: string } = {
                          'materiel': '#8b5cf6',
                          'applicatif': '#06b6d4',
                          'Non spécifié': '#9ca3af'
                        };
                        return <Cell key={`cell-spec-${index}`} fill={specColors[entry.spécialisation] || '#9ca3af'} />;
                      })}
                    </Pie>
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const displayName = props.payload.spécialisation === 'materiel' ? 'Matériel' : 
                                          props.payload.spécialisation === 'applicatif' ? 'Applicatif' : props.payload.spécialisation;
                        return [`${value} technicien(s)`, displayName];
                      }}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value: string) => {
                        if (value === 'materiel') return 'Matériel';
                        if (value === 'applicatif') return 'Applicatif';
                        return value;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
            })()}
          </div>
        </div>

        {/* Ligne 6 : Charge de travail par technicien + Utilisateurs les plus actifs */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: "24px", marginBottom: "24px" }}>
          {/* Charge de travail par technicien */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Charge de travail par technicien (Top 10)
            </h3>
            {(() => {
              const workloadData = prepareTechnicianWorkloadData();
              return workloadData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={workloadData} 
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" style={{ fontSize: "12px" }} />
                    <YAxis dataKey="technicien" type="category" stroke="#6b7280" style={{ fontSize: "12px" }} width={110} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="assignés" radius={[0, 0, 0, 0]} fill="#3b82f6" name="Assignés" />
                    <Bar dataKey="résolus" radius={[0, 8, 8, 0]} fill="#22c55e" name="Résolus" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
            })()}
          </div>

          {/* Utilisateurs les plus actifs */}
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Utilisateurs les plus actifs (Top 10)
            </h3>
            {(() => {
              const activeUsersData = prepareMostActiveUsersData();
              return activeUsersData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={activeUsersData} 
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" style={{ fontSize: "12px" }} />
                    <YAxis dataKey="utilisateur" type="category" stroke="#6b7280" style={{ fontSize: "12px" }} width={110} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="tickets" 
                      radius={[0, 8, 8, 0]}
                      fill="#8b5cf6"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                        </div>
              );
            })()}
                    </div>
        </div>

        {/* Ligne 7 : Temps moyen de résolution par type */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 6px 18px rgba(15,23,42,0.06)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#111827", marginBottom: "12px" }}>
              Temps moyen de résolution par type (en heures)
            </h3>
            {(() => {
              const resolutionTimeData = prepareResolutionTimeByTypeData();
              return resolutionTimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resolutionTimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="type" stroke="#6b7280" style={{ fontSize: "12px" }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} label={{ value: 'Heures', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      formatter={(value: any) => [`${value} heures`, 'Temps moyen']}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    />
                    <Legend />
                    <Bar dataKey="tempsMoyen" radius={[8, 8, 0, 0]}>
                      {resolutionTimeData.map((entry, index) => {
                        const typeColors: { [key: string]: string } = {
                          'Matériel': '#8b5cf6',
                          'Applicatif': '#06b6d4'
                        };
                        return <Cell key={`cell-resolution-${index}`} fill={typeColors[entry.type] || '#3b82f6'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                  Aucune donnée à afficher
                </div>
              );
          })()}
          </div>
        </div>
      </div>
      )}

            </>
          )}
          </>
        )}

          {activeSection === "tickets" && !showTicketDetailsPage && (
            <>
              {/* Barre de recherche */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                position: "relative",
                width: "100%",
                maxWidth: "500px",
                marginTop: "24px",
                marginBottom: "16px"
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

              <div style={{ 
                display: "flex", 
                gap: "16px", 
                marginTop: "0px",
                marginBottom: "24px", 
                flexWrap: "wrap",
                padding: "16px",
                borderRadius: "8px"
              }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#666" }}>Filtrer par statut</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ 
                      width: "100%", 
                      padding: "8px 12px", 
                      border: "1px solid #ddd", 
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "transparent"
                    }}
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="en_attente_analyse">En attente d'assignation</option>
                    <option value="en_traitement">En traitement</option>
                    <option value="resolu">Résolus</option>
                    <option value="cloture">Clôturés</option>
                    <option value="rejete">Relancés</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#666" }}>Filtrer par agence</label>
                  <select
                    value={agencyFilter}
                    onChange={(e) => setAgencyFilter(e.target.value)}
                    style={{ 
                      width: "100%", 
                      padding: "8px 12px", 
                      border: "1px solid #ddd", 
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "transparent"
                    }}
                  >
                    <option value="all">Toutes les agences</option>
                    {allAgencies.map((agency) => (
                      <option key={agency} value={agency || ""}>{agency}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#666" }}>Filtrer par priorité</label>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{ 
                      width: "100%", 
                      padding: "8px 12px", 
                      border: "1px solid #ddd", 
                      borderRadius: "4px",
                      fontSize: "14px",
                      backgroundColor: "transparent"
                    }}
                  >
                    <option value="all">Toutes les priorités</option>
                    <option value="critique">Critique</option>
                    <option value="haute">Haute</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="faible">Faible</option>
                  </select>
                </div>
                {userRole === "DSI" && (
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#666" }}>Filtrer par délégation</label>
                    <select
                      value={delegationFilter}
                      onChange={(e) => setDelegationFilter(e.target.value)}
                      style={{ 
                        width: "100%", 
                        padding: "8px 12px", 
                        border: "1px solid #ddd", 
                        borderRadius: "4px",
                        fontSize: "14px",
                        backgroundColor: "transparent"
                      }}
                    >
                      <option value="all">Tous les tickets</option>
                      <option value="delegated">Tickets délégués</option>
                      <option value="not_delegated">Tickets non délégués</option>
                    </select>
                  </div>
                )}
              </div>
              
              {/* Compteur de tickets avec icône */}
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
                  {filteredTickets.length} ticket(s) trouvé(s)
                </span>
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
                {filteredTickets.length === 0 ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "40px", 
                    color: "#999", 
                    fontWeight: "500",
                    background: "white",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  }}>
                    Aucun ticket
                  </div>
                ) : (
                  filteredTickets.map((t) => {
                    // Fonction helper pour obtenir les initiales
                    const getInitials = (name: string) => {
                      if (!name) return "??";
                      const parts = name.split(" ");
                      if (parts.length >= 2) {
                        return (parts[0][0] + parts[1][0]).toUpperCase();
                      }
                      return name.substring(0, 2).toUpperCase();
                    };

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

                    // Couleur de la barre selon la priorité
                    const borderColor = t.priority === "critique" ? "#E53E3E" : 
                                       t.priority === "haute" ? "#F59E0B" : 
                                       t.priority === "faible" ? "rgba(107, 114, 128, 0.3)" : 
                                       "#0DADDB";

                    // Déterminer le type de ticket basé sur la catégorie
                    const category = t.category || "";
                    const isApplicatif = category.toLowerCase().includes("logiciel") || 
                                        category.toLowerCase().includes("applicatif") ||
                                        category.toLowerCase().includes("application");
                    const categoryType = isApplicatif ? "Applicatif" : "Matériel";

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
                              background: t.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : 
                                         t.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : 
                                         t.status === "en_cours" ? "rgba(15, 31, 61, 0.1)" : 
                                         t.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : 
                                         t.status === "rejete" ? "#fee2e2" : 
                                         t.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                              color: t.status === "en_attente_analyse" ? "#0DADDB" : 
                                     t.status === "assigne_technicien" ? "#FF7A1B" : 
                                     t.status === "en_cours" ? "#0F1F3D" : 
                                     t.status === "resolu" ? "#2F9E44" : 
                                     t.status === "rejete" ? "#991b1b" : 
                                     t.status === "cloture" ? "#374151" : "#374151",
                              whiteSpace: "nowrap",
                            }}>
                              {t.status === "en_attente_analyse" ? "En attente d'assignation" :
                               t.status === "assigne_technicien" ? "Assigné" :
                               t.status === "en_cours" ? "En cours" :
                               t.status === "resolu" ? "Résolu" :
                               t.status === "rejete" ? "Relancé" :
                               t.status === "cloture" ? "Clôturé" : t.status}
                            </span>

                            {/* Badge Priorité */}
                            <span style={{
                              padding: "3px 8px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: "500",
                              background: t.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : 
                                         t.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : 
                                         t.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : 
                                         t.priority === "faible" ? "#E5E7EB" : "#e5e7eb",
                              color: t.priority === "critique" ? "#E53E3E" : 
                                     t.priority === "haute" ? "#F59E0B" : 
                                     t.priority === "moyenne" ? "#0DADDB" : 
                                     t.priority === "faible" ? "#6B7280" : "#374151",
                              whiteSpace: "nowrap",
                            }}>
                              {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                            </span>

                            {/* Badge Catégorie */}
                            {t.category && (
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
                                {isApplicatif ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                    <line x1="8" y1="21" x2="16" y2="21"></line>
                                    <line x1="12" y1="17" x2="12" y2="21"></line>
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                                  </svg>
                                )}
                                <span>{categoryType}</span>
                              </span>
                            )}
                          </div>

                          {/* Menu 3 points ou icône œil (pour clôturé) */}
                          <div style={{ position: "relative" }}>
                            {t.status === "cloture" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadTicketDetails(t.id);
                                }}
                                style={{
                                  background: "#6b7280",
                                  border: "1px solid white",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  padding: "6px 8px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "32px",
                                  height: "32px"
                                }}
                                title="Voir les détails"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                                  <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                              </button>
                            ) : (
                              <>
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
                                    const viewportHeight = window.innerHeight;
                                    const menuWidth = 220;
                                    const menuHeight = 220;

                                    let top = buttonRect.bottom + 4;
                                    if (viewportHeight - buttonRect.bottom < menuHeight && buttonRect.top > menuHeight) {
                                      top = buttonRect.top - menuHeight - 4;
                                    }

                                    let left = buttonRect.right - menuWidth;
                                    if (left < 8) left = 8;

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
                              </>
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

                        {/* Pied de carte : Créateur, Date, Agence, Assigné */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                                {t.creator?.full_name || "N/A"}
                              </span>
                            </div>

                            {/* Date relative */}
                            {t.created_at && (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                  {getRelativeTime(t.created_at)}
                                </span>
                              </div>
                            )}

                            {/* Agence */}
                            {(t.creator?.agency || t.user_agency) && (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                                </svg>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                  {t.creator?.agency || t.user_agency}
                                </span>
                              </div>
                            )}

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
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeSection === "reports" && (
            <>
              {selectedReport !== "statistiques" && (
                <div style={{ marginBottom: "24px" }}>
                  <h2 style={{ marginBottom: "8px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                    {selectedReport === "metriques" 
                      ? "Métriques de performance" 
                      : selectedReport === "agence"
                      ? "Analyses par agence"
                      : selectedReport === "technicien"
                      ? "Analyses par technicien"
                      : selectedReport === "evolutions"
                      ? "Évolutions dans le temps"
                      : selectedReport === "recurrents"
                      ? "Problèmes récurrents"
                      : "Rapports et Métriques"}
                  </h2>
                  {selectedReport === "metriques" && (
                    <p style={{ margin: "0", fontSize: "16px", color: "#6b7280", fontWeight: "400" }}>
                      Indicateurs clés de la qualité et de l'efficacité du support technique
                    </p>
                  )}
                  {selectedReport === "agence" && (
                    <p style={{ margin: "0", fontSize: "16px", color: "#6b7280", fontWeight: "400" }}>
                      Performance et répartition des tickets par agence
                    </p>
                  )}
                  {selectedReport === "technicien" && (
                    <p style={{ margin: "0", fontSize: "16px", color: "#6b7280", fontWeight: "400" }}>
                      Analyse détaillée de la performance individuelle de chaque technicien
                    </p>
                  )}
                  {selectedReport === "evolutions" && (
                    <p style={{ margin: "0", fontSize: "16px", color: "#6b7280", fontWeight: "400" }}>
                      Analyse des tendances et des évolutions temporelles des tickets et de la performance
                    </p>
                  )}
                  {selectedReport === "recurrents" && (
                    <p style={{ margin: "0", fontSize: "16px", color: "#6b7280", fontWeight: "400" }}>
                      Identification et analyse des problèmes qui reviennent fréquemment pour améliorer la prévention
                    </p>
                  )}
                </div>
              )}
              
              {!selectedReport && !showGenerateReport && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <p style={{ color: "#666", fontSize: "16px", marginBottom: "20px" }}>Sélectionnez un type de rapport dans le menu latéral</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("statistiques")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Statistiques générales</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Nombre total, répartition par statut, priorité, type</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("metriques")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Métriques de performance</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Temps moyen, satisfaction, escalades, réouvertures</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("agence")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Analyses par agence</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Volume, temps moyen, satisfaction par agence</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("technicien")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Analyses par technicien</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Tickets traités, temps moyen, charge, satisfaction</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("evolutions")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Évolutions dans le temps</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Tendances, pics d'activité, performance</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("recurrents")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>Problèmes récurrents</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Types fréquents, agences, patterns</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedReport === "statistiques" && (
                <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "32px" }}>
                  {/* Graphique 1: Tickets cette semaine */}
                  <div style={{ 
                    background: "white", 
                    borderRadius: "8px", 
                    border: "1px solid rgba(229, 231, 235, 0.5)", 
                    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", 
                    display: "flex", 
                    flexDirection: "column" 
                  }}>
                    {/* CardHeader */}
                    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", margin: 0 }}>
                        Tickets cette semaine
                      </h3>
                    </div>
                    {/* CardContent */}
                    <div style={{ padding: "24px", paddingTop: "0", flex: 1 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                          data={prepareWeeklyTicketsData()}
                          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis 
                            dataKey="jour" 
                            stroke="#E5E7EB"
                            tick={{ fill: "#6B7280", fontSize: 12 }}
                            style={{ fontSize: "12px" }}
                          />
                          <YAxis 
                            stroke="#E5E7EB"
                            tick={{ fill: "#6B7280", fontSize: 12 }}
                            style={{ fontSize: "12px" }}
                            domain={[0, 16]}
                            ticks={[0, 4, 8, 12, 16]}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e5e7eb", 
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                            }}
                          />
                          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="rect" />
                          <Bar 
                            dataKey="Créés" 
                            fill="#FF9500"
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                          />
                          <Bar 
                            dataKey="Résolus" 
                            fill="#22C55E"
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Graphique 2: Évolution mensuelle par type */}
                  <div style={{ 
                    background: "white", 
                    borderRadius: "8px", 
                    border: "1px solid rgba(229, 231, 235, 0.5)", 
                    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", 
                    display: "flex", 
                    flexDirection: "column" 
                  }}>
                    {/* CardHeader */}
                    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", margin: 0 }}>
                        Évolution mensuelle par type
                      </h3>
                    </div>
                    {/* CardContent */}
                    <div style={{ padding: "24px", paddingTop: "0", flex: 1 }}>
                      <ResponsiveContainer width="100%" height={320}>
                        <AreaChart
                          data={prepareMonthlyEvolutionData()}
                          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                        >
                          <defs>
                            <linearGradient id="colorMateriel" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FF9500" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#FF9500" stopOpacity={0.05}/>
                            </linearGradient>
                            <linearGradient id="colorApplicatif" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#475569" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#475569" stopOpacity={0.05}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis 
                            dataKey="mois" 
                            stroke="#E5E7EB"
                            tick={{ fill: "#6B7280", fontSize: 12 }}
                            style={{ fontSize: "12px" }}
                            angle={-45}
                            textAnchor="end"
                          />
                          <YAxis 
                            stroke="#E5E7EB"
                            tick={{ fill: "#6B7280", fontSize: 12 }}
                            style={{ fontSize: "12px" }}
                            domain={[0, 80]}
                            ticks={[0, 20, 40, 60, 80]}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e5e7eb", 
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                            }}
                          />
                          <Legend wrapperStyle={{ paddingTop: "20px" }} iconType="line" />
                          <Area 
                            type="monotone" 
                            dataKey="Matériel" 
                            stroke="#FF9500" 
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorMateriel)" 
                          />
                          <Area 
                            type="monotone" 
                            dataKey="Applicatif" 
                            stroke="#475569" 
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorApplicatif)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Deuxième ligne de graphiques - Donut charts */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "24px" }}>
                  {/* Graphique 3: Répartition par priorité */}
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: "600", color: "#333" }}>
                      Répartition par priorité
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={preparePriorityData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="#ffffff"
                          strokeWidth={2}
                          label={CustomLabel}
                          labelLine={false}
                        >
                          {preparePriorityData().map((entry, index) => {
                            const colors = {
                              "Critique": "#dc2626",
                              "Haute": "#FF9500",
                              "Moyenne": "#EAB308",
                              "Basse": "#22C55E"
                            };
                            return (
                              <Cell key={`cell-${index}`} fill={colors[entry.name as keyof typeof colors]} />
                            );
                          })}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }}
                          formatter={(value: number, name: string, props: any) => {
                            return [`${value} (${props.payload.percentage}%)`, name];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Graphique 4: Répartition par statut */}
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: "600", color: "#333" }}>
                      Répartition par statut
                    </h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={prepareStatusData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="#ffffff"
                          strokeWidth={2}
                          label={CustomLabel}
                          labelLine={false}
                        >
                          {prepareStatusData().map((entry, index) => {
                            const colors = {
                              "En cours": "#FF9500",
                              "En attente d'assignation": "#3B82F6",
                              "Relancé": "#EF4444",
                              "Résolu": "#22C55E",
                              "Délégué": "#8B5CF6"
                            };
                            return (
                              <Cell key={`cell-${index}`} fill={colors[entry.name as keyof typeof colors]} />
                            );
                          })}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }}
                          formatter={(value: number, name: string, props: any) => {
                            return [`${value} (${props.payload.percentage}%)`, name];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Troisième ligne de graphiques - Analyse par agence + Performance des techniciens */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "24px", marginTop: "24px" }}>
                  {/* Analyse par agence */}
                  <div style={{ 
                    background: "white", 
                    borderRadius: "8px", 
                    border: "1px solid rgba(229, 231, 235, 0.5)", 
                    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", 
                    display: "flex", 
                    flexDirection: "column" 
                  }}>
                    {/* CardHeader */}
                    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", margin: 0 }}>
                        Analyse par agence
                      </h3>
                    </div>
                    {/* CardContent */}
                    <div style={{ padding: "24px", paddingTop: "0", flex: 1 }}>
                      {(() => {
                        const agencyData = prepareAgencyAnalysisData();
                        return agencyData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart 
                              data={agencyData} 
                              layout="vertical"
                              margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                              barCategoryGap="20%"
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis 
                                type="number" 
                                domain={[0, 60]}
                                ticks={[0, 15, 30, 45, 60]}
                                stroke="#6B7280" 
                                style={{ fontSize: "12px" }}
                              />
                              <YAxis 
                                dataKey="agence" 
                                type="category" 
                                stroke="#374151" 
                                style={{ fontSize: "12px" }} 
                                width={90}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "white",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                                }}
                              />
                              <Legend 
                                wrapperStyle={{ marginTop: "20px" }}
                                iconType="rect"
                              />
                              <Bar 
                                dataKey="Total" 
                                fill="#1A202C"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                              />
                              <Bar 
                                dataKey="Résolus" 
                                fill="#22C55E"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                              />
                              <Bar 
                                dataKey="En attente" 
                                fill="#FF9500"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                            Aucune donnée à afficher
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Performance des techniciens */}
                  <div style={{ 
                    background: "white", 
                    borderRadius: "8px", 
                    border: "1px solid rgba(229, 231, 235, 0.5)", 
                    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", 
                    display: "flex", 
                    flexDirection: "column",
                    padding: "24px"
                  }}>
                    {/* CardHeader */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", margin: 0 }}>
                        Performance des techniciens
                      </h3>
                    </div>
                    
                    {/* Graphique en barres verticales */}
                    <div style={{ marginBottom: "24px" }}>
                      {(() => {
                        const techData = prepareTechnicianPerformanceData();
                        return techData.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart 
                              data={techData} 
                              margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                              <XAxis 
                                dataKey="technicien" 
                                stroke="#6B7280" 
                                style={{ fontSize: "12px" }}
                              />
                              <YAxis 
                                domain={[0, 60]}
                                ticks={[0, 15, 30, 45, 60]}
                                stroke="#6B7280" 
                                style={{ fontSize: "12px" }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: "white",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "8px",
                                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                                }}
                                content={({ active, payload, label }: any) => {
                                  if (active && payload && payload.length) {
                                    return (
                                      <div style={{
                                        backgroundColor: "white",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "8px",
                                        padding: "8px 12px",
                                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                                      }}>
                                        <div style={{ color: "#111827", marginBottom: "4px" }}>
                                          {label}
                                        </div>
                                        <div style={{ color: "#FF9500" }}>
                                          Résolus : {payload[0].value}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar 
                                dataKey="performance" 
                                fill="#FF9500"
                                stroke="#FF9500"
                                radius={[4, 4, 0, 0]}
                                barSize={40}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                            Aucune donnée à afficher
                          </div>
                        );
                      })()}
                    </div>

                    {/* Liste détaillée des techniciens */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {(() => {
                        const techData = prepareTechnicianPerformanceData();
                        return techData.map((tech, index) => {
                          // Identifier Seydou Wane et Backary DRAME pour appliquer des styles spécifiques
                          const isSeydouWane = tech.technicien.toLowerCase().includes("seydou") && tech.technicien.toLowerCase().includes("wane");
                          const isBackaryDrame = tech.technicien.toLowerCase().includes("backary") && tech.technicien.toLowerCase().includes("drame");
                          const isSpecialTechnician = isSeydouWane || isBackaryDrame;
                          
                          return (
                          <div 
                            key={tech.technicien}
                            style={{ 
                              background: isSpecialTechnician ? "#F5F5F5" : "#FFFFFF", 
                              borderRadius: "12px", 
                              border: "1px solid #F2F2F2", 
                              padding: isSpecialTechnician ? "10px 14px" : "16px 20px", 
                              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                              display: "flex",
                              alignItems: "center",
                              gap: "20px",
                              minHeight: isSpecialTechnician ? "44px" : "56px",
                              fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                            }}
                          >
                            {/* Badge de rang */}
                            <div 
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                backgroundColor: index === 0 
                                  ? "#F5EDD4" // Rang 1 : Couleur exacte demandée
                                  : "#E5E5E5", // Autres rangs : Gris clair
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                                fontWeight: 500,
                                color: index === 0 
                                  ? "#C4A941" // Rang 1 : Couleur exacte demandée
                                  : "#262626", // Autres rangs : texte foncé
                                flexShrink: 0,
                                boxShadow: "none",
                                border: "none"
                              }}
                            >
                              {index + 1}
                            </div>

                            {/* Nom du technicien */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: isSpecialTechnician ? "12px" : "14px", fontWeight: 600, color: "#262626" }}>
                                {tech.technicien}
                              </div>
                            </div>

                            {/* Temps moyen avec icône */}
                            <div 
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: isSpecialTechnician ? "12px" : "14px",
                                fontWeight: 400,
                                color: isSpecialTechnician ? "#000000" : "#808080",
                                flexShrink: 0
                              }}
                            >
                              <Clock className="h-3 w-3" style={{ width: isSpecialTechnician ? "10px" : "12px", height: isSpecialTechnician ? "10px" : "12px", color: isSpecialTechnician ? "#000000" : "#808080" }} />
                              <span>{tech.avgTimeHours > 0 ? `${tech.avgTimeHours.toFixed(1)}h moy.` : "N/A"}</span>
                            </div>

                            {/* Badge de performance */}
                            <div 
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                backgroundColor: "#D4F5E0",
                                color: "#1B8A3E",
                                padding: "6px 12px",
                                borderRadius: "14px",
                                fontSize: "13px",
                                fontWeight: 500,
                                minWidth: "60px",
                                height: "28px",
                                justifyContent: "center",
                                flexShrink: 0
                              }}
                            >
                              <TrendingUp className="h-4 w-4" style={{ width: "16px", height: "16px", color: "#1B8A3E" }} />
                              <span>{tech.performancePercent}%</span>
                            </div>
                          </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
                </>
              )}

              {selectedReport === "metriques" && (() => {
                // Utiliser le temps moyen du tableau de bord (metrics.avgResolutionTime)
                const avgResolutionTimeDisplay = metrics.avgResolutionTime ?? "Chargement...";
                const targetResolutionDays = 3; // Objectif de 3 jours
                
                // Extraire le nombre de jours depuis le format affiché (ex: "3.9 jours" ou "4 jours 2h")
                let avgResolutionDaysRounded = 0;
                if (avgResolutionTimeDisplay && avgResolutionTimeDisplay !== "Chargement..." && avgResolutionTimeDisplay !== null) {
                  const match = avgResolutionTimeDisplay.match(/(\d+(?:\.\d+)?)\s*jour/);
                  if (match) {
                    avgResolutionDaysRounded = parseFloat(match[1]);
                  } else {
                    // Si format en heures, convertir
                    const hoursMatch = avgResolutionTimeDisplay.match(/(\d+)\s*h/);
                    if (hoursMatch) {
                      avgResolutionDaysRounded = parseFloat(hoursMatch[1]) / 24;
                    }
                  }
                }
                
                const isAboveTarget = avgResolutionDaysRounded > targetResolutionDays;
                const diffFromTarget = avgResolutionDaysRounded > targetResolutionDays ? Math.round(avgResolutionDaysRounded - targetResolutionDays) : 0;
                
                const resolvedTickets = allTickets.filter(t => t.status === "resolu" || t.status === "cloture");
                
                // Calculer la satisfaction en utilisant feedback_score si disponible
                const ticketsWithFeedback = resolvedTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
                const avgFeedback = ticketsWithFeedback.length > 0 
                  ? ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length
                  : null;
                
                // Si pas de feedback, utiliser la logique basée sur rejeté/résolu
                const rejectedTicketsRpt = allTickets.filter(t => t.status === "rejete");
                const resolvedCountRpt = resolvedTickets.length;
                const rejectedCountRpt = rejectedTicketsRpt.length;
                const denomRpt = resolvedCountRpt + rejectedCountRpt;
                
                let satisfactionRate = 0;
                if (avgFeedback !== null) {
                  // Convertir la note sur 5 en pourcentage
                  satisfactionRate = (avgFeedback / 5) * 100;
                } else if (denomRpt > 0) {
                  satisfactionRate = (resolvedCountRpt / denomRpt) * 100;
                }
                const satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
                const satisfactionChange = "+5%"; // Peut être calculé avec historique
                const isSatisfactionExcellent = satisfactionRate >= 95;
                
                // Calculer les tickets escaladés (critiques en cours)
                const escalatedTickets = allTickets.filter((t) => 
                  t.priority === "critique" && 
                  (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours")
                ).length;
                const escalatedActive = escalatedTickets;
                
                // Calculer le taux de réouverture réel
                const totalResolvedOrClosed = resolvedTickets.length;
                const reopeningRate = totalResolvedOrClosed > 0 
                  ? ((reopenedTicketsCount / totalResolvedOrClosed) * 100).toFixed(1) 
                  : "0.0";
                const reopeningRateDisplay = `${reopeningRate}%`;
                const isReopeningExcellent = parseFloat(reopeningRate) <= 5;
                
                // Calculs pour "Volume de tickets - Ce mois"
                const now = new Date();
                const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                
                const thisMonthTickets = allTickets.filter(t => {
                  if (!t.created_at) return false;
                  const created = new Date(t.created_at);
                  return created >= currentMonthStart;
                });
                
                const lastMonthTickets = allTickets.filter(t => {
                  if (!t.created_at) return false;
                  const created = new Date(t.created_at);
                  return created >= lastMonthStart && created <= lastMonthEnd;
                });
                
                const thisMonthResolved = thisMonthTickets.filter(t => t.status === "resolu" || t.status === "cloture").length;
                const thisMonthCreated = thisMonthTickets.length;
                const thisMonthPending = thisMonthTickets.filter(t => 
                  t.status !== "resolu" && t.status !== "cloture" && t.status !== "rejete"
                ).length;
                
                const lastMonthCreated = lastMonthTickets.length;
                const createdChange = lastMonthCreated > 0 
                  ? ((thisMonthCreated - lastMonthCreated) / lastMonthCreated * 100).toFixed(0)
                  : "0";
                const resolutionRate = thisMonthCreated > 0 
                  ? ((thisMonthResolved / thisMonthCreated) * 100).toFixed(0)
                  : "0";
                const pendingRate = thisMonthCreated > 0 
                  ? ((thisMonthPending / thisMonthCreated) * 100).toFixed(0)
                  : "0";
                
                // Calculs pour "Performance par catégorie"
                const materielTickets = resolvedTickets.filter(t => t.type === "materiel");
                const applicatifTickets = resolvedTickets.filter(t => t.type === "applicatif");
                
                const calculateAvgTime = (tickets: Ticket[]) => {
                  let total = 0;
                  let count = 0;
                  tickets.forEach(ticket => {
                    // Ne compter que les tickets avec une date de création ET une date de résolution/clôture réelle
                    if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
                      const created = new Date(ticket.created_at);
                      const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
                      const diffDays = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
                      // Ne compter que si le résultat est valide (différence positive)
                      if (diffDays >= 0) {
                        total += diffDays;
                        count++;
                      }
                    }
                  });
                  return count > 0 ? (total / count).toFixed(1) : "0.0";
                };
                
                const materielAvgDays = calculateAvgTime(materielTickets);
                const applicatifAvgDays = calculateAvgTime(applicatifTickets);
                const materielCount = materielTickets.length;
                const applicatifCount = applicatifTickets.length;
                
                return (
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                    {/* 4 KPIs principaux */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "32px" }}>
                      {/* Temps moyen de résolution */}
                      <div style={{ padding: "12px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div style={{ width: "32px", height: "32px", background: "#fff3e0", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: "16px" }}>🕐</span>
                          </div>
                          {diffFromTarget > 0 && (
                            <div style={{ fontSize: "11px", color: "#dc2626", fontWeight: "500" }}>+{diffFromTarget}j</div>
                          )}
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#ea580c", marginBottom: "4px" }}>{avgResolutionTimeDisplay}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>Temps moyen de résolution</div>
                        {isAboveTarget && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#92400e" }}>
                            <span>⚠️</span>
                            <span>Au-dessus de l'objectif ({targetResolutionDays}j)</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Taux de satisfaction */}
                      <div style={{ padding: "12px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div style={{ width: "32px", height: "32px", background: "#f0fdf4", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ color: "white", fontSize: "10px" }}>✓</span>
                            </div>
                          </div>
                          <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500", display: "flex", alignItems: "center", gap: "3px" }}>
                            <span>📈</span>
                            <span>{satisfactionChange}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#15803d", marginBottom: "4px" }}>{satisfactionDisplay}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>Taux de satisfaction utilisateur</div>
                        {isSatisfactionExcellent && (
                          <div style={{ fontSize: "10px", color: "#16a34a", display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>✓</span>
                            <span>Excellent résultat</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Tickets escaladés */}
                      <div style={{ padding: "12px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div style={{ width: "32px", height: "32px", background: "#fef2f2", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: "16px", color: "#dc2626" }}>⚠️</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500" }}>{escalatedActive} actifs</div>
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#dc2626", marginBottom: "4px" }}>{escalatedTickets}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>Tickets escaladés</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>Critiques en cours</div>
                      </div>
                      
                      {/* Taux de réouverture */}
                      <div style={{ padding: "12px", background: "white", borderRadius: "8px", border: "1px solid #e5e7eb", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div style={{ width: "32px", height: "32px", background: "#eff6ff", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3 18L9 12L13 16L21 8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M21 8H15V14" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          {isReopeningExcellent && (
                            <div style={{ fontSize: "11px", color: "#16a34a", fontWeight: "500" }}>Excellent</div>
                          )}
                        </div>
                        <div style={{ fontSize: "22px", fontWeight: "bold", color: "#2563eb", marginBottom: "4px" }}>{reopeningRateDisplay}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>Taux de réouverture</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>Tickets rouverts après résolution</div>
                      </div>
                    </div>
                    
                    {/* Volume de tickets - Ce mois */}
                    <div style={{ marginBottom: "32px" }}>
                      <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Volume de tickets - Ce mois</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                        <div style={{ padding: "20px", background: "#eff6ff", borderRadius: "12px", border: "1px solid #dbeafe" }}>
                          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#2563eb", marginBottom: "8px" }}>{thisMonthCreated}</div>
                          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>Total créés</div>
                          <div style={{ fontSize: "13px", color: "#16a34a" }}>vs mois dernier +{createdChange}%</div>
                        </div>
                        <div style={{ padding: "20px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #dcfce7" }}>
                          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#16a34a", marginBottom: "8px" }}>{thisMonthResolved}</div>
                          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>Total résolus</div>
                          <div style={{ fontSize: "13px", color: "#16a34a" }}>Taux de résolution {resolutionRate}%</div>
                        </div>
                        <div style={{ padding: "20px", background: "#fff7ed", borderRadius: "12px", border: "1px solid #ffedd5" }}>
                          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ea580c", marginBottom: "8px" }}>{thisMonthPending}</div>
                          <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>En attente</div>
                          <div style={{ fontSize: "13px", color: "#ea580c" }}>Nécessitent action {pendingRate}%</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Performance par catégorie */}
                    <div style={{ marginBottom: "32px" }}>
                      <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Performance par catégorie</h4>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px" }}>Temps moyen</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Matériel */}
                        <div style={{ padding: "20px", background: "#f8f9fa", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{ fontSize: "24px" }}>🔧</span>
                              <span style={{ fontSize: "16px", fontWeight: "500", color: "#333" }}>Matériel</span>
                            </div>
                            <div style={{ fontSize: "20px", fontWeight: "600", color: "#2563eb" }}>{materielAvgDays} jours</div>
                          </div>
                          <div style={{ width: "100%", height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                            <div style={{ width: `${Math.min((parseFloat(materielAvgDays) / 5) * 100, 100)}%`, height: "100%", background: "#2563eb", borderRadius: "4px" }}></div>
                          </div>
                          <div style={{ fontSize: "13px", color: "#6b7280" }}>{materielCount} tickets traités</div>
                        </div>
                        
                        {/* Applicatif */}
                        <div style={{ padding: "20px", background: "#f8f9fa", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span style={{ fontSize: "24px" }}>💻</span>
                              <span style={{ fontSize: "16px", fontWeight: "500", color: "#333" }}>Applicatif</span>
                            </div>
                            <div style={{ fontSize: "20px", fontWeight: "600", color: "#7c3aed" }}>{applicatifAvgDays} jours</div>
                          </div>
                          <div style={{ width: "100%", height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                            <div style={{ width: `${Math.min((parseFloat(applicatifAvgDays) / 5) * 100, 100)}%`, height: "100%", background: "#7c3aed", borderRadius: "4px" }}></div>
                          </div>
                          <div style={{ fontSize: "13px", color: "#6b7280" }}>{applicatifCount} tickets traités</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Boutons d'export */}
                    <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                      <button 
                        onClick={() => exportToPDF()}
                        style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}
                      >
                        Exporter PDF
                      </button>
                      <button 
                        onClick={() => exportToExcel()}
                        style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}
                      >
                        Exporter Excel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {selectedReport === "agence" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  {/* Graphique Tickets par Agence */}
                  <div style={{ marginBottom: "40px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Tickets par Agence</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart 
                        data={prepareAgencyData()} 
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <YAxis 
                          dataKey="agence" 
                          type="category" 
                          stroke="#6b7280" 
                          style={{ fontSize: "12px" }}
                          width={70}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }} 
                        />
                        <Bar 
                          dataKey="tickets" 
                          radius={[0, 8, 8, 0]}
                          fill="#4b5563"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Volume de tickets par agence</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Agence</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Nombre de tickets</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Temps moyen</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Satisfaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean))).map((agency) => {
                          const agencyTickets = allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency);
                          
                          // Calculer le temps moyen de résolution pour cette agence (uniquement avec dates réelles)
                          const resolvedAgencyTickets = agencyTickets.filter(t => t.status === "resolu" || t.status === "cloture");
                          let totalResolutionTime = 0;
                          let countWithDates = 0;
                          
                          resolvedAgencyTickets.forEach(ticket => {
                            // Ne compter que les tickets avec une date de création ET une date de résolution/clôture réelle
                            if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
                              const created = new Date(ticket.created_at);
                              const resolved = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date(ticket.closed_at!);
                              const diffTime = resolved.getTime() - created.getTime();
                              const diffDays = diffTime / (1000 * 60 * 60 * 24);
                              // Ne compter que si le résultat est valide (différence positive)
                              if (diffDays >= 0) {
                                totalResolutionTime += diffDays;
                                countWithDates++;
                              }
                            }
                          });
                          
                          const avgResolutionDays = countWithDates > 0 ? totalResolutionTime / countWithDates : 0;
                          const avgResolutionDisplay = countWithDates > 0 
                            ? avgResolutionDays % 1 === 0 
                              ? `${Math.round(avgResolutionDays)} jour${Math.round(avgResolutionDays) > 1 ? 's' : ''}`
                              : `${avgResolutionDays.toFixed(1)} jours`
                            : "N/A";
                          
                          // Calculer la satisfaction pour cette agence
                          const ticketsWithFeedback = resolvedAgencyTickets.filter(t => t.feedback_score !== null && t.feedback_score !== undefined);
                          let satisfactionDisplay = "N/A";
                          
                          if (ticketsWithFeedback.length > 0) {
                            // Utiliser les feedbacks réels
                            const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
                            satisfactionDisplay = `${((avgFeedback / 5) * 100).toFixed(1)}%`;
                          } else if (resolvedAgencyTickets.length > 0) {
                            // Calculer satisfaction implicite basée sur résolu/rejeté
                            const rejectedAgencyTickets = agencyTickets.filter(t => t.status === "rejete");
                            const resolvedCount = resolvedAgencyTickets.length;
                            const rejectedCount = rejectedAgencyTickets.length;
                            const totalProcessed = resolvedCount + rejectedCount;
                            if (totalProcessed > 0) {
                              const satisfactionRate = (resolvedCount / totalProcessed) * 100;
                              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
                            }
                          }
                          
                          return (
                            <tr key={agency}>
                              <td style={{ padding: "12px" }}>{agency}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{agencyTickets.length}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{avgResolutionDisplay}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{satisfactionDisplay}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button 
                      onClick={() => exportToPDF()}
                      style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel()}
                      style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {selectedReport === "technicien" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Performance des techniciens</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Technicien</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Tickets traités</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Temps moyen</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Charge actuelle</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Satisfaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {technicians.map((tech) => {
                          const techTickets = allTickets.filter((t) => t.technician_id === tech.id);
                          const inProgress = techTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours").length;
                          const resolvedTickets = techTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
                          
                          // Calculer le temps moyen de résolution
                          let avgTimeDisplay = "N/A";
                          if (resolvedTickets.length > 0) {
                            let totalHours = 0;
                            let countWithDates = 0;
                            
                            resolvedTickets.forEach((ticket) => {
                              if (ticket.created_at) {
                                const created = new Date(ticket.created_at);
                                let resolvedDate: Date | null = null;
                                
                                if (ticket.status === "cloture" && ticket.closed_at) {
                                  resolvedDate = new Date(ticket.closed_at);
                                } else if (ticket.status === "resolu" && ticket.resolved_at) {
                                  resolvedDate = new Date(ticket.resolved_at);
                                }
                                
                                if (resolvedDate) {
                                  const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                                  if (diffHours >= 0) {
                                    totalHours += diffHours;
                                    countWithDates++;
                                  }
                                }
                              }
                            });
                            
                            if (countWithDates > 0) {
                              const avgHours = totalHours / countWithDates;
                              if (avgHours < 24) {
                                avgTimeDisplay = `${avgHours.toFixed(1)}h`;
                              } else {
                                const avgDays = avgHours / 24;
                                avgTimeDisplay = `${avgDays.toFixed(1)}j`;
                              }
                            }
                          }
                          
                          // Calculer la satisfaction
                          let satisfactionDisplay = "N/A";
                          if (resolvedTickets.length > 0) {
                            const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined);
                            
                            if (ticketsWithFeedback.length > 0) {
                              // Utiliser les feedbacks explicites
                              const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
                              const satisfactionRate = (avgFeedback / 5) * 100;
                              satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
                            } else {
                              // Calculer satisfaction implicite basée sur le temps de résolution
                              let totalSatisfaction = 0;
                              let countSatisfaction = 0;
                              
                              resolvedTickets.forEach((ticket) => {
                                if (ticket.created_at) {
                                  const created = new Date(ticket.created_at);
                                  let resolvedDate: Date | null = null;
                                  
                                  if (ticket.status === "cloture" && ticket.closed_at) {
                                    resolvedDate = new Date(ticket.closed_at);
                                  } else if (ticket.status === "resolu" && ticket.resolved_at) {
                                    resolvedDate = new Date(ticket.resolved_at);
                                  }
                                  
                                  if (resolvedDate) {
                                    const diffHours = (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
                                    const diffDays = diffHours / 24;
                                    
                                    let satisfactionScore = 0;
                                    if (ticket.priority === "haute" || ticket.priority === "critique") {
                                      if (diffHours < 24) satisfactionScore = 100;
                                      else if (diffHours < 48) satisfactionScore = 80;
                                      else if (diffHours < 72) satisfactionScore = 60;
                                      else satisfactionScore = 40;
                                    } else if (ticket.priority === "moyenne") {
                                      if (diffDays < 3) satisfactionScore = 100;
                                      else if (diffDays < 5) satisfactionScore = 80;
                                      else if (diffDays < 7) satisfactionScore = 60;
                                      else satisfactionScore = 40;
                                    } else {
                                      if (diffDays < 7) satisfactionScore = 100;
                                      else if (diffDays < 14) satisfactionScore = 80;
                                      else if (diffDays < 21) satisfactionScore = 60;
                                      else satisfactionScore = 40;
                                    }
                                    
                                    totalSatisfaction += satisfactionScore;
                                    countSatisfaction++;
                                  }
                                }
                              });
                              
                              if (countSatisfaction > 0) {
                                const avgSatisfaction = totalSatisfaction / countSatisfaction;
                                satisfactionDisplay = `${avgSatisfaction.toFixed(1)}%`;
                              }
                            }
                          }
                          
                          return (
                            <tr key={tech.id}>
                              <td style={{ padding: "12px" }}>{tech.full_name}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{resolvedTickets.length}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{avgTimeDisplay}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{inProgress}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{satisfactionDisplay}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button 
                      onClick={() => exportToPDF()}
                      style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel()}
                      style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {selectedReport === "evolutions" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  {/* Graphique 1: Volume de tickets créés vs résolus */}
                  <div style={{ marginBottom: "40px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Volume de tickets (30 derniers jours)</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={prepareTimeSeriesData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }} 
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="créés" 
                          stroke={colors.primary} 
                          strokeWidth={3}
                          dot={{ fill: colors.primary, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="résolus" 
                          stroke={colors.success} 
                          strokeWidth={3}
                          dot={{ fill: colors.success, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Graphique 2: Évolution par statut */}
                  <div style={{ marginBottom: "40px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Évolution par statut (7 derniers jours)</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={prepareStatusEvolutionData()}>
                        <defs>
                          <linearGradient id="colorEnAttente" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={statusColors['En attente']} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={statusColors['En attente']} stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorEnCours" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={statusColors['En cours']} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={statusColors['En cours']} stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorResolus" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={statusColors['Résolus']} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={statusColors['Résolus']} stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorClotures" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={statusColors['Clôturés']} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={statusColors['Clôturés']} stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }} 
                        />
                        <Legend />
                        <Area type="monotone" dataKey="En attente" stackId="1" stroke={statusColors['En attente']} fill="url(#colorEnAttente)" />
                        <Area type="monotone" dataKey="En cours" stackId="1" stroke={statusColors['En cours']} fill="url(#colorEnCours)" />
                        <Area type="monotone" dataKey="Résolus" stackId="1" stroke={statusColors['Résolus']} fill="url(#colorResolus)" />
                        <Area type="monotone" dataKey="Clôturés" stackId="1" stroke={statusColors['Clôturés']} fill="url(#colorClotures)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Graphiques en grille: Priorités, Jours de la semaine, Satisfaction */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px", marginBottom: "40px" }}>
                    {/* Graphique 3: Répartition par priorité */}
                    <div>
                      <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par priorité</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={preparePriorityEvolutionData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="priorité" stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e5e7eb", 
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                            }} 
                          />
                          <Bar dataKey="nombre" radius={[8, 8, 0, 0]}>
                            {preparePriorityEvolutionData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={priorityColors[entry.priorité as keyof typeof priorityColors] || colors.primary} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Graphique 4: Pics d'activité par jour de la semaine */}
                    <div>
                      <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Pics d'activité (jours de la semaine)</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={prepareDayOfWeekData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="jour" stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e5e7eb", 
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                            }} 
                          />
                          <Bar dataKey="tickets" radius={[8, 8, 0, 0]} fill={colors.secondary} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Graphique 5: Répartition par heure */}
                  <div style={{ marginBottom: "40px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition des tickets par heure de la journée</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={prepareHourlyData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="heure" stroke="#6b7280" style={{ fontSize: "11px" }} />
                        <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "white", 
                            border: "1px solid #e5e7eb", 
                            borderRadius: "8px",
                            boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                          }} 
                        />
                        <Bar dataKey="tickets" radius={[4, 4, 0, 0]}>
                          {prepareHourlyData().map((entry, index) => {
                            const hour = parseInt(entry.heure);
                            let color = colors.info;
                            if (hour >= 9 && hour <= 17) color = colors.primary; // Heures de bureau
                            else if (hour >= 18 && hour <= 22) color = colors.warning; // Soirée
                            else color = colors.secondary; // Nuit
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Graphique 6: Satisfaction utilisateur */}
                  {prepareSatisfactionData().length > 0 && (
                    <div style={{ marginBottom: "40px" }}>
                      <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Évolution de la satisfaction utilisateur (7 derniers jours)</h4>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={prepareSatisfactionData()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <YAxis domain={[0, 5]} stroke="#6b7280" style={{ fontSize: "12px" }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: "white", 
                              border: "1px solid #e5e7eb", 
                              borderRadius: "8px",
                              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                            }} 
                          />
                          <Line 
                            type="monotone" 
                            dataKey="satisfaction" 
                            stroke={colors.pink} 
                            strokeWidth={3}
                            dot={{ fill: colors.pink, r: 5 }}
                            activeDot={{ r: 7 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "12px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                    <button 
                      onClick={() => exportToPDF()}
                      style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500" }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel()}
                      style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500" }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {selectedReport === "recurrents" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  {/* Problèmes les plus fréquents */}
                  <div style={{ marginBottom: "32px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>•</span> Problèmes les plus fréquents
                    </h4>
                    <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px" }}>
                      {getMostFrequentProblems().length > 0 ? (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {getMostFrequentProblems().map((problem, index) => (
                            <li key={index} style={{ 
                              padding: "12px", 
                              borderBottom: index < getMostFrequentProblems().length - 1 ? "1px solid #dee2e6" : "none",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center"
                            }}>
                              <span style={{ color: "#333", fontSize: "14px" }}>{problem.problème}</span>
                              <span style={{ 
                                color: "#666", 
                                fontSize: "14px", 
                                fontWeight: "600",
                                background: "#e3f2fd",
                                padding: "4px 12px",
                                borderRadius: "12px"
                              }}>
                                {problem.occurrences} occurrence{problem.occurrences > 1 ? 's' : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ color: "#999", fontSize: "14px", margin: 0, textAlign: "center", padding: "20px" }}>
                          Aucun problème récurrent identifié
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Applications/équipements problématiques */}
                  <div style={{ marginBottom: "32px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>•</span> Applications/équipements problématiques
                    </h4>
                    <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px" }}>
                      {getProblematicApplications().length > 0 ? (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {getProblematicApplications().map((app, index) => (
                            <li key={index} style={{ 
                              padding: "12px", 
                              borderBottom: index < getProblematicApplications().length - 1 ? "1px solid #dee2e6" : "none",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center"
                            }}>
                              <span style={{ color: "#333", fontSize: "14px" }}>{app.application}</span>
                              <span style={{ 
                                color: "#666", 
                                fontSize: "14px", 
                                fontWeight: "600",
                                background: "#fff3e0",
                                padding: "4px 12px",
                                borderRadius: "12px"
                              }}>
                                {app.tickets} ticket{app.tickets > 1 ? 's' : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ color: "#999", fontSize: "14px", margin: 0, textAlign: "center", padding: "20px" }}>
                          Aucune application problématique identifiée
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Recommandations de résolution */}
                  <div style={{ marginBottom: "32px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>•</span> Recommandations de résolution
                    </h4>
                    <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px" }}>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        <li style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <span style={{ color: "#333", fontSize: "14px" }}>
                            Analyser les tickets résolus similaires pour identifier les solutions efficaces
                          </span>
                        </li>
                        <li style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <span style={{ color: "#333", fontSize: "14px" }}>
                            Mettre en place une documentation pour les problèmes fréquents
                          </span>
                        </li>
                        <li style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <span style={{ color: "#333", fontSize: "14px" }}>
                            Former les techniciens sur les problèmes récurrents identifiés
                          </span>
                        </li>
                        <li style={{ padding: "12px" }}>
                          <span style={{ color: "#333", fontSize: "14px" }}>
                            Évaluer la nécessité d'une maintenance préventive pour les équipements problématiques
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Historique des problèmes */}
                  <div style={{ marginBottom: "32px" }}>
                    <h4 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>•</span> Historique des problèmes
                    </h4>
                    <div style={{ background: "white", padding: "0", borderRadius: "8px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
                      {getRecurringTicketsHistory().length > 0 ? (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#f8f9fa" }}>
                              <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontSize: "13px", fontWeight: "600", color: "#333" }}>Problème</th>
                              <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #dee2e6", fontSize: "13px", fontWeight: "600", color: "#333" }}>Occurrences</th>
                              <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6", fontSize: "13px", fontWeight: "600", color: "#333" }}>Dernière occurrence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getRecurringTicketsHistory().map((item, index) => (
                              <tr key={index} style={{ borderBottom: index < getRecurringTicketsHistory().length - 1 ? "1px solid #e5e7eb" : "none", background: index % 2 === 0 ? "white" : "#f8f9fa" }}>
                                <td style={{ padding: "12px", color: "#333", fontSize: "14px" }}>{item.titre}</td>
                                <td style={{ padding: "12px", textAlign: "center" }}>
                                  <span style={{ 
                                    background: "#e3f2fd", 
                                    color: "#1976d2",
                                    padding: "4px 12px",
                                    borderRadius: "12px",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    display: "inline-block"
                                  }}>
                                    {item.occurrences}
                                  </span>
                                </td>
                                <td style={{ padding: "12px", textAlign: "right", color: "#666", fontSize: "14px" }}>
                                  {item.dernier ? new Date(item.dernier).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p style={{ color: "#999", fontSize: "14px", margin: 0, textAlign: "center", padding: "20px" }}>
                          Aucun problème récurrent dans l'historique
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "12px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                    <button 
                      onClick={() => viewDetailedReport("Problèmes récurrents")}
                      style={{ 
                        padding: "10px 20px", 
                        backgroundColor: "#1e3a5f", 
                        color: "white", 
                        border: "none", 
                        borderRadius: "8px", 
                        cursor: "pointer",
                        fontWeight: "500"
                      }}
                    >
                      Voir Rapport
                    </button>
                    <button 
                      onClick={() => exportToPDF("Problèmes récurrents")}
                      style={{ 
                        padding: "10px 20px", 
                        backgroundColor: "#28a745", 
                        color: "white", 
                        border: "none", 
                        borderRadius: "8px", 
                        cursor: "pointer",
                        fontWeight: "500"
                      }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel("Problèmes récurrents")}
                      style={{ 
                        padding: "10px 20px", 
                        backgroundColor: "#17a2b8", 
                        color: "white", 
                        border: "none", 
                        borderRadius: "8px", 
                        cursor: "pointer",
                        fontWeight: "500"
                      }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire de génération de rapport */}
              {showGenerateReport && !showOutputFormat && (
                <div style={{ background: "white", padding: "32px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", marginTop: "24px", zIndex: 10, position: "relative" }}>
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#1e3a5f", marginBottom: "20px", fontFamily: "monospace" }}>Type de Rapport *</h3>
                    <div style={{ 
                      border: "1px solid #007bff", 
                      borderLeft: "3px solid #007bff",
                      borderTop: "1px solid #007bff",
                      borderRadius: "0 4px 4px 0",
                      padding: "16px",
                      position: "relative",
                      backgroundColor: "#f8f9fa"
                    }}>
                      <select
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          fontSize: "16px",
                          color: "#333",
                          backgroundColor: "white"
                        }}
                      >
                        <option value="">[Sélectionner un type ▼]</option>
                        <option value="performance">Performance Globale</option>
                        <option value="tickets_department">Tickets par Département</option>
                        <option value="technicians">Performance des Techniciens</option>
                        <option value="satisfaction">Satisfaction Utilisateurs</option>
                        <option value="recurrent">Problèmes Récurrents</option>
                        <option value="audit">Audit et Logs</option>
                      </select>
                      <div style={{ marginTop: "16px", paddingLeft: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Performance Globale</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Tickets par Département</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Performance des Techniciens</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Satisfaction Utilisateurs</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Problèmes Récurrents</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <span style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Audit et Logs</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#1e3a5f", marginBottom: "20px", fontFamily: "monospace" }}>Période *</h3>
                    <div style={{ 
                      border: "1px solid #007bff", 
                      borderLeft: "3px solid #007bff",
                      borderTop: "1px solid #007bff",
                      borderRadius: "0 4px 4px 0",
                      padding: "16px",
                      backgroundColor: "#f8f9fa"
                    }}>
                      <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", marginBottom: "8px", color: "#1e3a5f", fontSize: "16px" }}>Du :</label>
                          <input
                            type="date"
                            value={reportPeriodFrom}
                            onChange={(e) => setReportPeriodFrom(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              fontSize: "16px",
                              color: "#333"
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", marginBottom: "8px", color: "#1e3a5f", fontSize: "16px" }}>Au :</label>
                          <input
                            type="date"
                            value={reportPeriodTo}
                            onChange={(e) => setReportPeriodTo(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              fontSize: "16px",
                              color: "#333"
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#1e3a5f", marginBottom: "20px", fontFamily: "monospace" }}>Filtres (Optionnel)</h3>
                    <div style={{ 
                      border: "1px solid #007bff", 
                      borderLeft: "3px solid #007bff",
                      borderTop: "1px solid #007bff",
                      borderRadius: "0 4px 4px 0",
                      padding: "16px",
                      backgroundColor: "#f8f9fa"
                    }}>
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <label style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Département :</label>
                        </div>
                        <select
                          value={reportFilters.department}
                          onChange={(e) => setReportFilters({...reportFilters, department: e.target.value})}
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            fontSize: "16px",
                            color: "#333",
                            backgroundColor: "white"
                          }}
                        >
                          <option value="all">Tous</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <label style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Technicien :</label>
                        </div>
                        <select
                          value={reportFilters.technician}
                          onChange={(e) => setReportFilters({...reportFilters, technician: e.target.value})}
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            fontSize: "16px",
                            color: "#333",
                            backgroundColor: "white"
                          }}
                        >
                          <option value="all">Tous</option>
                          {technicians.map((tech) => (
                            <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <label style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Type de Ticket :</label>
                        </div>
                        <select
                          value={reportFilters.ticketType}
                          onChange={(e) => setReportFilters({...reportFilters, ticketType: e.target.value})}
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            fontSize: "16px",
                            color: "#333",
                            backgroundColor: "white"
                          }}
                        >
                          <option value="all">Tous</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                          <label style={{ color: "#1e3a5f", fontSize: "16px", fontFamily: "monospace" }}>Priorité :</label>
                        </div>
                        <select
                          value={reportFilters.priority}
                          onChange={(e) => setReportFilters({...reportFilters, priority: e.target.value})}
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            fontSize: "16px",
                            color: "#333",
                            backgroundColor: "white"
                          }}
                        >
                          <option value="all">Tous</option>
                          <option value="critique">Critique</option>
                          <option value="haute">Haute</option>
                          <option value="moyenne">Moyenne</option>
                          <option value="faible">Faible</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "16px", justifyContent: "flex-end", marginTop: "32px" }}>
                    <button
                      onClick={() => {
                        setShowGenerateReport(false);
                        setReportType("");
                        setReportPeriodFrom("2024-01-01");
                        setReportPeriodTo("2024-01-31");
                        setReportFilters({ department: "all", technician: "all", ticketType: "all", priority: "all" });
                      }}
                      style={{
                        padding: "10px 24px",
                        backgroundColor: "transparent",
                        color: "#1e3a5f",
                        border: "1px solid #1e3a5f",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500"
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => {
                        if (reportType && reportPeriodFrom && reportPeriodTo) {
                          setShowOutputFormat(true);
                        }
                      }}
                      disabled={!reportType || !reportPeriodFrom || !reportPeriodTo}
                      style={{
                        padding: "10px 24px",
                        backgroundColor: reportType && reportPeriodFrom && reportPeriodTo ? "#1e3a5f" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: reportType && reportPeriodFrom && reportPeriodTo ? "pointer" : "not-allowed",
                        fontSize: "16px",
                        fontWeight: "500"
                      }}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}

              {/* Format de Sortie */}
              {showGenerateReport && showOutputFormat && (
                <div style={{ background: "white", padding: "32px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", marginTop: "24px" }}>
                  <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#1e3a5f", marginBottom: "24px", fontFamily: "monospace" }}>Format de Sortie</h3>
                  <div style={{ 
                    border: "2px dashed #1e3a5f",
                    borderRadius: "4px",
                    padding: "24px"
                  }}>
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                        <label style={{ color: "#1e3a5f", fontSize: "16px", cursor: "pointer", flex: 1, fontFamily: "monospace" }}>
                          <input
                            type="radio"
                            name="outputFormat"
                            value="pdf"
                            checked={outputFormat === "pdf"}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            style={{ marginRight: "8px" }}
                          />
                          PDF
                        </label>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                        <label style={{ color: "#1e3a5f", fontSize: "16px", cursor: "pointer", flex: 1, fontFamily: "monospace" }}>
                          <input
                            type="radio"
                            name="outputFormat"
                            value="excel"
                            checked={outputFormat === "excel"}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            style={{ marginRight: "8px" }}
                          />
                          Excel
                        </label>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                        <label style={{ color: "#1e3a5f", fontSize: "16px", cursor: "pointer", flex: 1, fontFamily: "monospace" }}>
                          <input
                            type="radio"
                            name="outputFormat"
                            value="csv"
                            checked={outputFormat === "csv"}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            style={{ marginRight: "8px" }}
                          />
                          CSV
                        </label>
                      </div>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
                        <label style={{ color: "#1e3a5f", fontSize: "16px", cursor: "pointer", flex: 1, fontFamily: "monospace" }}>
                          <input
                            type="radio"
                            name="outputFormat"
                            value="screen"
                            checked={outputFormat === "screen"}
                            onChange={(e) => setOutputFormat(e.target.value)}
                            style={{ marginRight: "8px" }}
                          />
                          Afficher à l'écran
                        </label>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "16px", justifyContent: "flex-end", marginTop: "32px" }}>
                    <button
                      onClick={() => setShowOutputFormat(false)}
                      style={{
                        padding: "10px 24px",
                        backgroundColor: "transparent",
                        color: "#1e3a5f",
                        border: "1px solid #1e3a5f",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "500",
                        fontFamily: "monospace"
                      }}
                    >
                      [Annuler]
                    </button>
                    <button
                      onClick={() => {
                        // Générer le rapport
                        console.log("Génération du rapport:", { reportType, reportPeriodFrom, reportPeriodTo, reportFilters, outputFormat });
                        // Réinitialiser le formulaire
                        setShowGenerateReport(false);
                        setShowOutputFormat(false);
                        setReportType("");
                        setReportPeriodFrom("2024-01-01");
                        setReportPeriodTo("2024-01-31");
                        setReportFilters({ department: "all", technician: "all", ticketType: "all", priority: "all" });
                        setOutputFormat("");
                      }}
                      disabled={!outputFormat}
                      style={{
                        padding: "10px 24px",
                        backgroundColor: outputFormat ? "#1e3a5f" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: outputFormat ? "pointer" : "not-allowed",
                        fontSize: "16px",
                        fontWeight: "500",
                        fontFamily: "monospace"
                      }}
                    >
                      [Générer Rapport]
                    </button>
                  </div>
                </div>
              )}
             </>
           )}

           {activeSection === "users" && (() => {
             // Filtrer les utilisateurs
             let filteredUsers = allUsers;
             
             if (userRoleFilter !== "all") {
               filteredUsers = filteredUsers.filter((u: any) => u.role?.name === userRoleFilter);
             }
             
             if (userStatusFilter !== "all") {
               filteredUsers = filteredUsers.filter((u: any) => {
                 const isActive = u.actif === true;
                 return userStatusFilter === "actif" ? isActive : !isActive;
               });
             }
             
             if (userAgencyFilter !== "all") {
               filteredUsers = filteredUsers.filter((u: any) => u.agency === userAgencyFilter);
             }
             
             if (searchQuery) {
               filteredUsers = filteredUsers.filter((u: any) => 
                 u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                 u.email?.toLowerCase().includes(searchQuery.toLowerCase())
               );
             }
             
             // Pagination
             const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
             const startIndex = (currentPage - 1) * usersPerPage;
             const endIndex = startIndex + usersPerPage;
             const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
             
             // Récupérer les rôles et agences uniques pour les filtres
             const uniqueRoles = Array.from(new Set(allUsers.map((u: any) => u.role?.name).filter(Boolean)));
             const uniqueAgencies = Array.from(new Set(allUsers.map((u: any) => u.agency).filter(Boolean)));
             
             return (
               <>
                 <h2 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>Gestion des utilisateurs</h2>
                 
                 {/* Barre d'actions */}
                 <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                   <button 
                     onClick={() => setShowAddUserModal(true)}
                     style={{ padding: "8px 16px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "14px" }}
                   >
                     [+ Ajouter un utilisateur]
                   </button>
                   <button style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "14px" }}>
                     [Importer CSV]
                   </button>
                   <button style={{ padding: "8px 16px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "14px" }}>
                     [Exporter]
                   </button>
                 </div>
                 
                 {/* Filtres */}
                 <div style={{ marginBottom: "16px" }}>
                   <div style={{ display: "flex", gap: "16px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
                     <span style={{ color: "#28a745", fontWeight: "500" }}>Filtrer :</span>
                     <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <span style={{ color: "#28a745", fontWeight: "500" }}>Rôle :</span>
                       <div style={{ position: "relative", display: "inline-block" }}>
                         <select
                           value={userRoleFilter}
                           onChange={(e) => {
                             setUserRoleFilter(e.target.value);
                             setCurrentPage(1);
                           }}
                           style={{ 
                             padding: "6px 24px 6px 12px", 
                             borderRadius: "4px", 
                             border: "1px solid #ddd", 
                             backgroundColor: "white", 
                             color: "#333", 
                             fontSize: "14px", 
                             cursor: "pointer",
                             appearance: "none",
                             WebkitAppearance: "none",
                             MozAppearance: "none"
                           }}
                         >
                           <option value="all">Tous</option>
                           {uniqueRoles.map((role) => (
                             <option key={role} value={role}>{role}</option>
                           ))}
                         </select>
                         <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }}>▼</span>
                       </div>
                     </div>
                     <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <span style={{ color: "#28a745", fontWeight: "500" }}>Statut :</span>
                       <div style={{ position: "relative", display: "inline-block" }}>
                         <select
                           value={userStatusFilter}
                           onChange={(e) => {
                             setUserStatusFilter(e.target.value);
                             setCurrentPage(1);
                           }}
                           style={{ 
                             padding: "6px 24px 6px 12px", 
                             borderRadius: "4px", 
                             border: "1px solid #ddd", 
                             backgroundColor: "white", 
                             color: "#333", 
                             fontSize: "14px", 
                             cursor: "pointer",
                             appearance: "none",
                             WebkitAppearance: "none",
                             MozAppearance: "none"
                           }}
                         >
                           <option value="all">Tous</option>
                           <option value="actif">Actif</option>
                           <option value="inactif">Inactif</option>
                         </select>
                         <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }}>▼</span>
                       </div>
                     </div>
                     <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <span style={{ color: "#28a745", fontWeight: "500" }}>Département :</span>
                       <div style={{ position: "relative", display: "inline-block" }}>
                         <select
                           value={userAgencyFilter}
                           onChange={(e) => {
                             setUserAgencyFilter(e.target.value);
                             setCurrentPage(1);
                           }}
                           style={{ 
                             padding: "6px 24px 6px 12px", 
                             borderRadius: "4px", 
                             border: "1px solid #ddd", 
                             backgroundColor: "white", 
                             color: "#333", 
                             fontSize: "14px", 
                             cursor: "pointer",
                             appearance: "none",
                             WebkitAppearance: "none",
                             MozAppearance: "none"
                           }}
                         >
                           <option value="all">Tous</option>
                           {uniqueAgencies.map((agency) => (
                             <option key={agency} value={agency}>{agency}</option>
                           ))}
                         </select>
                         <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }}>▼</span>
                       </div>
                     </div>
                   </div>
                 </div>
                 
                 {/* Recherche */}
                 <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                   <span style={{ color: "#333", fontWeight: "500" }}>Rechercher :</span>
                   <input
                     type="text"
                     value={searchQuery}
                     onChange={(e) => {
                       setSearchQuery(e.target.value);
                       setCurrentPage(1);
                     }}
                     placeholder="🔍 Rechercher un utilisateur..."
                     style={{ flex: 1, maxWidth: "400px", padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "14px" }}
                   />
                 </div>
                 
                 {/* Tableau des utilisateurs */}
                 <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", border: "1px solid #e0e0e0" }}>
                   <thead>
                     <tr style={{ background: "#f8f9fa" }}>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>ID</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>Nom</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>Email</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>Rôle</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>Statut</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontWeight: "600" }}>Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {paginatedUsers.length === 0 ? (
                       <tr>
                         <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                           Aucun utilisateur trouvé
                         </td>
                       </tr>
                     ) : (
                       paginatedUsers.map((user: any, index: number) => {
                         const isActive = user.actif === true;
                         const displayId = startIndex + index + 1;
                         return (
                           <tr key={user.id} style={{ borderBottom: "1px solid #eee" }}>
                             <td style={{ padding: "12px 16px" }}>{displayId}</td>
                             <td style={{ padding: "12px 16px" }}>{user.full_name || "N/A"}</td>
                             <td style={{ padding: "12px 16px" }}>{user.email || "N/A"}</td>
                             <td style={{ padding: "12px 16px" }}>{user.role?.name || "N/A"}</td>
                             <td style={{ padding: "12px 16px" }}>
                               {isActive ? (
                                 <span style={{ color: "#28a745", fontWeight: "500" }}>Actif ✓</span>
                               ) : (
                                 <span style={{ color: "#dc3545", fontWeight: "500" }}>Inactif ❌</span>
                               )}
                             </td>
                             <td style={{ padding: "12px 16px" }}>
                               <div style={{ display: "flex", gap: "8px" }}>
                                 <button
                                   onClick={() => handleEditUser(user)}
                                   style={{ 
                                     padding: "8px 16px", 
                                     backgroundColor: "#17a2b8", 
                                     border: "none", 
                                     borderRadius: "4px", 
                                     cursor: "pointer", 
                                     fontSize: "14px",
                                     color: "white",
                                     fontWeight: "500"
                                   }}
                                 >
                                   Modifier
                                 </button>
                                 <button
                                   onClick={() => {
                                     if (confirm(`Êtes-vous sûr de vouloir réinitialiser le mot de passe de ${user.full_name} ?`)) {
                                       handleResetPassword(user);
                                     }
                                   }}
                                   style={{ 
                                     padding: "8px 16px", 
                                     backgroundColor: "#ff9800", 
                                     border: "none", 
                                     borderRadius: "4px", 
                                     cursor: "pointer", 
                                     fontSize: "14px",
                                     color: "white",
                                     fontWeight: "500"
                                   }}
                                 >
                                   Réinitialiser
                                 </button>
                                 <button
                                   onClick={() => {
                                     if (confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${user.full_name} ? Cette action est irréversible.`)) {
                                       handleDeleteUser(user);
                                     }
                                   }}
                                   style={{ 
                                     padding: "8px 16px", 
                                     backgroundColor: "#dc3545", 
                                     border: "none", 
                                     borderRadius: "4px", 
                                     cursor: "pointer", 
                                     fontSize: "14px",
                                     color: "white",
                                     fontWeight: "500"
                                   }}
                                 >
                                   Supprimer
                                 </button>
                               </div>
                             </td>
                           </tr>
                         );
                       })
                     )}
                   </tbody>
                 </table>
                 
                 {/* Pagination */}
                 <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
                   <span style={{ color: "#333", fontWeight: "500" }}>Pagination :</span>
                   <button
                     onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                     disabled={currentPage === 1}
                     style={{ padding: "6px 12px", backgroundColor: currentPage === 1 ? "#e0e0e0" : "#007bff", color: currentPage === 1 ? "#999" : "white", border: "none", borderRadius: "4px", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "14px" }}
                   >
                     [&lt; Précédent]
                   </button>
                   <span style={{ color: "#333", fontSize: "14px" }}>Page {currentPage} sur {totalPages || 1}</span>
                   <button
                     onClick={() => setCurrentPage(prev => Math.min(totalPages || 1, prev + 1))}
                     disabled={currentPage >= (totalPages || 1)}
                     style={{ padding: "6px 12px", backgroundColor: currentPage >= (totalPages || 1) ? "#e0e0e0" : "#007bff", color: currentPage >= (totalPages || 1) ? "#999" : "white", border: "none", borderRadius: "4px", cursor: currentPage >= (totalPages || 1) ? "not-allowed" : "pointer", fontSize: "14px" }}
                   >
                     [Suivant &gt;]
                   </button>
                 </div>
               </>
             );
           })()}

          {activeSection === "technicians" && userRole !== "Admin" && (
            <div style={{ padding: "24px" }}>
              {/* Deux panneaux côte à côte */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                {/* Panneau gauche : Membres de l'équipe DSI */}
                <div style={{
                  background: "hsl(0, 0%, 100%)",
                  borderRadius: "8px",
                  border: "1px solid hsla(220, 20%, 92%, 0.5)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  height: "fit-content"
                }}>
                  {/* Header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: "12px",
                    borderBottom: "1px solid hsla(220, 20%, 92%, 0.5)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Users size={20} color="hsl(25, 95%, 53%)" />
                      <h3 style={{
                        fontSize: "16px",
                        fontWeight: 500,
                        color: "#111827",
                        margin: 0,
                        fontFamily: "'Inter', system-ui, sans-serif"
                      }}>
                        Membres de l'équipe DSI
                      </h3>
                    </div>
                    {(() => {
                      // Récupérer les membres DSI et Adjoint DSI depuis allUsers
                      const dsiAndAdjointMembers = allUsers.filter((user: any) => 
                        user.role?.name === "DSI" || 
                        user.role?.name === "Adjoint DSI"
                      );
                      
                      // Compter tous les membres (DSI + Adjoint DSI + Techniciens)
                      const totalMembers = dsiAndAdjointMembers.length + technicians.length;
                      
                      return (
                        <div style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: "hsl(25, 95%, 53%)",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: 600,
                          marginLeft: "auto"
                        }}>
                          {totalMembers}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Liste des membres */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "12px" }}>
                    {(() => {
                      // Récupérer les membres DSI et Adjoint DSI depuis allUsers
                      const dsiAndAdjointMembers = allUsers.filter((user: any) => 
                        user.role?.name === "DSI" || 
                        user.role?.name === "Adjoint DSI"
                      );
                      
                      // Récupérer tous les techniciens depuis la liste technicians
                      // et les convertir au format attendu avec le rôle "Support Technique"
                      const technicianMembers = technicians.map((tech: any) => ({
                        ...tech,
                        role: { name: "Support Technique" }
                      }));
                      
                      // Combiner les deux listes
                      const allTeamMembers = [...dsiAndAdjointMembers, ...technicianMembers];
                      
                      if (allTeamMembers.length === 0) {
                        return (
                          <div style={{ padding: "20px", textAlign: "center", color: "hsl(220, 15%, 45%)" }}>
                            Aucun membre trouvé
                          </div>
                        );
                      }

                      return allTeamMembers.map((member: any) => {
                        const initials = member.full_name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .substring(0, 2) || "??";
                        
                        const roleName = member.role?.name || "";
                        const isTechnician = roleName === "Support Technique";
                        
                        return (
                          <div
                            key={member.id}
                            style={{
                              padding: "12px",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              cursor: "pointer",
                              transition: "all 200ms",
                              border: "1px solid transparent"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "hsla(220, 20%, 92%, 0.5)";
                              e.currentTarget.style.background = "hsla(220, 20%, 92%, 0.5)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "transparent";
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            {/* Avatar */}
                            <div style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: "hsla(25, 95%, 53%, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "hsl(25, 95%, 53%)",
                              fontSize: "14px",
                              fontWeight: 600,
                              flexShrink: 0
                            }}>
                              {initials}
                            </div>
                            
                            {/* Infos */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: "14px",
                                  fontWeight: 500,
                                  color: "#111827"
                                }}>
                                  {member.full_name}
                                </div>
                                {(roleName === "DSI" || roleName === "Adjoint DSI" || roleName === "Support Technique") && (
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Briefcase size={12} color="#6B7280" />
                                    <span style={{
                                      fontSize: "12px",
                                      color: "#6B7280"
                                    }}>
                                      {roleName === "Adjoint DSI" ? "DSI" : roleName}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                                {roleName === "DSI" && (
                                  <span style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    background: "hsla(25, 95%, 53%, 0.1)",
                                    color: "hsl(25, 95%, 53%)",
                                    border: "none"
                                  }}>
                                    DSI
                                  </span>
                                )}
                                {roleName === "Adjoint DSI" && (
                                  <span style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    background: "hsla(220, 60%, 15%, 0.1)",
                                    color: "hsl(220, 60%, 15%)",
                                    border: "none"
                                  }}>
                                    Adjoint DSI
                                  </span>
                                )}
                                {isTechnician && (
                                  <span style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    background: "hsla(142, 76%, 36%, 0.1)",
                                    color: "hsl(142, 76%, 36%)",
                                    border: "none"
                                  }}>
                                    Technicien
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Panneau droit : Techniciens */}
                <div style={{
                  background: "hsl(0, 0%, 100%)",
                  borderRadius: "8px",
                  border: "1px solid hsla(220, 20%, 92%, 0.5)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column"
                }}>
                  {/* Header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "16px"
                  }}>
                    <Wrench size={18} color="hsl(25, 95%, 53%)" />
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "#111827",
                      margin: 0,
                      fontFamily: "'Inter', system-ui, sans-serif"
                    }}>
                      Techniciens
                    </h3>
                  </div>

                  {/* Liste des techniciens */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {technicians.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: "hsl(220, 15%, 45%)" }}>
                        Aucun technicien trouvé
                      </div>
                    ) : (
                      technicians.map((tech: any) => {
                        const initials = tech.full_name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .substring(0, 2) || "??";
                        
                        // Calculer les tickets relancés (par défaut 0 si non disponible)
                        const reopenedCount = 0; // À calculer depuis l'historique si nécessaire
                        
                        return (
                          <div
                            key={tech.id}
                            style={{
                              border: "1px solid hsla(220, 20%, 92%, 0.5)",
                              borderRadius: "8px",
                              padding: "16px",
                              transition: "all 200ms",
                              cursor: "pointer"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "hsla(25, 95%, 53%, 0.5)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "hsla(220, 20%, 92%, 0.5)";
                            }}
                          >
                            {/* En-tête avec avatar et infos */}
                            <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                              {/* Avatar */}
                              <div style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "50%",
                                background: "hsla(25, 95%, 53%, 0.1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "hsl(25, 95%, 53%)",
                                fontSize: "14px",
                                fontWeight: 600,
                                flexShrink: 0
                              }}>
                                {initials}
                              </div>
                              
                              {/* Infos */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  color: "#111827",
                                  marginBottom: "4px"
                                }}>
                                  {tech.full_name}
                                </div>
                                <div style={{
                                  fontSize: "14px",
                                  color: "hsl(220, 15%, 45%)",
                                  marginBottom: "12px"
                                }}>
                                  {tech.email}
                                </div>
                                
                                {/* Badge spécialisation */}
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  {tech.specialization === "materiel" ? (
                                    <>
                                      <Wrench size={12} color="hsl(220, 15%, 45%)" />
                                      <span style={{
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        fontSize: "12px",
                                        border: "1px solid hsla(220, 20%, 92%, 0.5)",
                                        color: "hsl(220, 15%, 45%)"
                                      }}>
                                        Matériel
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="hsl(220, 15%, 45%)" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                        <line x1="8" y1="21" x2="16" y2="21"></line>
                                        <line x1="12" y1="17" x2="12" y2="21"></line>
                                      </svg>
                                      <span style={{
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        fontSize: "12px",
                                        border: "1px solid hsla(220, 20%, 92%, 0.5)",
                                        color: "hsl(220, 15%, 45%)"
                                      }}>
                                        Applicatif
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Statistiques */}
                            <div style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "8px",
                              marginTop: "12px"
                            }}>
                              {/* En cours */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={12} color="hsl(199, 89%, 48%)" />
                                  <span style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "hsl(199, 89%, 48%)"
                                  }}>
                                    {tech.in_progress_tickets_count || 0}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: "12px",
                                  color: "hsl(220, 15%, 45%)"
                                }}>
                                  En cours
                                </span>
                              </div>

                              {/* Assignés */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Wrench size={12} color="hsl(25, 95%, 53%)" />
                                  <span style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "hsl(25, 95%, 53%)"
                                  }}>
                                    {tech.assigned_tickets_count || 0}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: "12px",
                                  color: "hsl(220, 15%, 45%)"
                                }}>
                                  Assignés
                                </span>
                              </div>

                              {/* Résolus */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <CheckCircle2 size={12} color="hsl(142, 76%, 36%)" />
                                  <span style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "hsl(142, 76%, 36%)"
                                  }}>
                                    {tech.resolved_tickets_count || tech.closed_tickets_count || 0}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: "12px",
                                  color: "hsl(220, 15%, 45%)"
                                }}>
                                  Résolus
                                </span>
                              </div>

                              {/* Relancés */}
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <AlertTriangle size={12} color="hsl(0, 84%, 60%)" />
                                  <span style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "hsl(0, 84%, 60%)"
                                  }}>
                                    {reopenedCount}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: "12px",
                                  color: "hsl(220, 15%, 45%)"
                                }}>
                                  Relancés
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

           {/* Modal de détails du technicien */}
           {showTechnicianDetailsModal && selectedTechnicianDetails && (
             <div style={{
               position: "fixed",
               top: 0,
               left: 0,
               width: "100%",
               height: "100%",
               background: "rgba(0, 0, 0, 0.5)",
               display: "flex",
               justifyContent: "center",
               alignItems: "center",
               zIndex: 1000,
             }}>
               <div style={{
                 background: "white",
                 padding: "30px",
                 borderRadius: "10px",
                 boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
                 width: "90%",
                 maxWidth: "600px",
                 position: "relative",
                 maxHeight: "90vh",
                 overflowY: "auto"
               }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                   <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333", margin: 0 }}>Détails du Technicien</h2>
                   <button
                     onClick={() => {
                       setShowTechnicianDetailsModal(false);
                       setSelectedTechnicianDetails(null);
                     }}
                     style={{
                       background: "transparent",
                       border: "none",
                       fontSize: "24px",
                       cursor: "pointer",
                       color: "#999",
                       padding: "0",
                       width: "30px",
                       height: "30px",
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "center"
                     }}
                   >
                     ×
                   </button>
                 </div>

                 <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                   {/* Informations personnelles */}
                   <div>
                     <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", marginBottom: "12px" }}>Informations personnelles</h3>
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                       <div style={{ display: "flex", gap: "12px" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Nom complet:</span>
                         <span style={{ color: "#333" }}>{selectedTechnicianDetails.full_name}</span>
                       </div>
                       <div style={{ display: "flex", gap: "12px" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Email:</span>
                         <span style={{ color: "#333" }}>{selectedTechnicianDetails.email}</span>
                       </div>
                       {selectedTechnicianDetails.phone && (
                         <div style={{ display: "flex", gap: "12px" }}>
                           <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Téléphone:</span>
                           <span style={{ color: "#333" }}>{selectedTechnicianDetails.phone}</span>
                         </div>
                       )}
                       {selectedTechnicianDetails.agency && (
                         <div style={{ display: "flex", gap: "12px" }}>
                           <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Agence:</span>
                           <span style={{ color: "#333" }}>{selectedTechnicianDetails.agency}</span>
                         </div>
                       )}
                       <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Spécialisation:</span>
                         <span style={{
                           padding: "4px 8px",
                           borderRadius: "12px",
                           fontSize: "12px",
                           fontWeight: "500",
                           background: selectedTechnicianDetails.specialization === "materiel" ? "#007bff" : "#28a745",
                           color: "white",
                           whiteSpace: "nowrap"
                         }}>
                           {selectedTechnicianDetails.specialization === "materiel" ? "Matériel" : selectedTechnicianDetails.specialization === "applicatif" ? "Applicatif" : "Non défini"}
                         </span>
                       </div>
                       <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Statut:</span>
                         <span style={{
                           padding: "4px 8px",
                           borderRadius: "12px",
                           fontSize: "12px",
                           fontWeight: "500",
                           background: selectedTechnicianDetails.actif === true ? "#28a745" : "#6c757d",
                           color: "white",
                           whiteSpace: "nowrap"
                         }}>
                           {selectedTechnicianDetails.actif === true ? "Actif" : "Inactif"}
                         </span>
                       </div>
                       <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Disponibilité:</span>
                         <span style={{
                           padding: "4px 8px",
                           borderRadius: "12px",
                           fontSize: "12px",
                           fontWeight: "500",
                           background: selectedTechnicianDetails.actif === true ? "#28a745" : "#6c757d",
                           color: "white",
                           whiteSpace: "nowrap"
                         }}>
                           {selectedTechnicianDetails.actif === true ? "Disponible" : "Indisponible"}
                         </span>
                       </div>
                       {selectedTechnicianDetails.last_login_at && (
                         <div style={{ display: "flex", gap: "12px" }}>
                           <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Dernière connexion:</span>
                           <span style={{ color: "#333" }}>
                             {new Date(selectedTechnicianDetails.last_login_at).toLocaleString("fr-FR", {
                               day: "2-digit",
                               month: "2-digit",
                               year: "numeric",
                               hour: "2-digit",
                               minute: "2-digit"
                             })}
                           </span>
                         </div>
                       )}
                     </div>
                   </div>

                   {/* Statistiques */}
                   <div>
                     <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333", marginBottom: "12px" }}>Statistiques</h3>
                     <div style={{ 
                       display: "grid", 
                       gridTemplateColumns: "repeat(2, 1fr)", 
                       gap: "16px" 
                     }}>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#007bff", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.assigned_tickets_count || 0}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Tickets Assignés</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#28a745", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.in_progress_tickets_count || 0}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Tickets en Cours</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#17a2b8", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.resolved_tickets_count || 0}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Tickets Résolus</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#6c757d", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.closed_tickets_count || 0}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Tickets Clôturés</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#ffc107", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.resolved_this_month || 0}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Résolus ce Mois</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#fd7e14", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.avg_resolution_time_days !== undefined ? `${selectedTechnicianDetails.avg_resolution_time_days}` : "0"}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Jours (Moyenne)</div>
                       </div>
                       <div style={{ 
                         padding: "16px", 
                         background: "#f8f9fa", 
                         borderRadius: "8px",
                         textAlign: "center",
                         gridColumn: "span 2"
                       }}>
                         <div style={{ fontSize: "32px", fontWeight: "700", color: "#20c997", marginBottom: "4px" }}>
                           {selectedTechnicianDetails.success_rate !== undefined ? `${selectedTechnicianDetails.success_rate}%` : "0%"}
                         </div>
                         <div style={{ fontSize: "14px", color: "#666" }}>Taux de Réussite</div>
                       </div>
                     </div>
                   </div>
                 </div>

                 <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px", gap: "12px" }}>
                   <button
                     onClick={() => {
                       setShowTechnicianDetailsModal(false);
                       setSelectedTechnicianDetails(null);
                     }}
                     style={{
                       padding: "10px 20px",
                       background: "#6c757d",
                       color: "white",
                       border: "none",
                       borderRadius: "5px",
                       cursor: "pointer",
                       fontSize: "14px"
                     }}
                   >
                     Fermer
                   </button>
                 </div>
               </div>
             </div>
           )}

           {/* Modal Créer un technicien */}
           {showCreateTechnicianModal && (
             <div style={{
               position: "fixed",
               top: 0,
               left: 0,
               width: "100%",
               height: "100%",
               background: "rgba(0, 0, 0, 0.5)",
               display: "flex",
               justifyContent: "center",
               alignItems: "center",
               zIndex: 1000,
             }}>
               <div style={{
                 background: "white",
                 padding: "30px",
                 borderRadius: "10px",
                 boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
                 width: "90%",
                 maxWidth: "500px",
                 position: "relative",
                 maxHeight: "90vh",
                 overflowY: "auto"
               }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                   <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333", margin: 0 }}>Créer un Technicien</h2>
                   <button
                     onClick={() => setShowCreateTechnicianModal(false)}
                     style={{
                       background: "transparent",
                       border: "none",
                       fontSize: "24px",
                       cursor: "pointer",
                       color: "#999",
                       padding: "0",
                       width: "30px",
                       height: "30px",
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "center"
                     }}
                   >
                     ×
                   </button>
                 </div>

                 <form onSubmit={async (e) => {
                   e.preventDefault();
                   if (!token) return;
                   
                   setLoading(true);
                   try {
                     // Récupérer le rôle Technicien
                     const rolesRes = await fetch("http://localhost:8000/auth/roles", {
                       headers: {
                         Authorization: `Bearer ${token}`,
                       },
                     });
                     
                     if (!rolesRes.ok) {
                       throw new Error("Impossible de récupérer les rôles");
                     }
                     
                     const roles = await rolesRes.json();
                     const technicianRole = roles.find((r: any) => r.name === "Technicien");
                     
                     if (!technicianRole) {
                       alert("Erreur: Le rôle Technicien n'existe pas");
                       return;
                     }

                     const createData: any = {
                       full_name: (e.target as any).full_name.value,
                       email: (e.target as any).email.value,
                       username: (e.target as any).username.value,
                       password: (e.target as any).password.value,
                       phone: (e.target as any).phone.value || null,
                       agency: (e.target as any).agency.value || null,
                       specialization: (e.target as any).specialization.value || null,
                       max_tickets_capacity: (e.target as any).max_tickets_capacity?.value ? parseInt((e.target as any).max_tickets_capacity.value) : null,
                       notes: (e.target as any).notes?.value || null,
                       role_id: technicianRole.id
                     };

                     const res = await fetch("http://localhost:8000/users/", {
                       method: "POST",
                       headers: {
                         "Content-Type": "application/json",
                         Authorization: `Bearer ${token}`,
                       },
                       body: JSON.stringify(createData),
                     });

                     if (res.ok) {
                       alert("Technicien créé avec succès");
                       setShowCreateTechnicianModal(false);
                       // Recharger les techniciens
                       const techRes = await fetch("http://localhost:8000/users/technicians", {
                         headers: {
                           Authorization: `Bearer ${token}`,
                         },
                       });
                       if (techRes.ok) {
                         const techData = await techRes.json();
                         const techsWithStats = await Promise.all(
                           techData.map(async (tech: any) => {
                             try {
                               const statsRes = await fetch(`http://localhost:8000/users/technicians/${tech.id}/stats`, {
                                 headers: {
                                   Authorization: `Bearer ${token}`,
                                 },
                               });
                               if (statsRes.ok) {
                                 const stats = await statsRes.json();
                                 return { ...tech, ...stats };
                               }
                             } catch (err) {
                               console.error(`Erreur stats pour ${tech.id}:`, err);
                             }
                            return { ...tech, workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
                           })
                         );
                         setTechnicians(techsWithStats);
                       }
                     } else {
                       const error = await res.json();
                       alert(`Erreur: ${error.detail || "Impossible de créer le technicien"}`);
                     }
                   } catch (err) {
                     console.error("Erreur:", err);
                     alert("Une erreur est survenue lors de la création");
                   } finally {
                     setLoading(false);
                   }
                 }}>
                   <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Nom complet *</label>
                       <input
                         type="text"
                         name="full_name"
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Email *</label>
                       <input
                         type="email"
                         name="email"
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Nom d'utilisateur *</label>
                       <input
                         type="text"
                         name="username"
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Mot de passe *</label>
                       <input
                         type="password"
                         name="password"
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Téléphone</label>
                       <input
                         type="tel"
                         name="phone"
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Agence</label>
                       <input
                         type="text"
                         name="agency"
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Spécialisation *</label>
                       <select
                         name="specialization"
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           background: "white"
                         }}
                       >
                         <option value="">Sélectionner...</option>
                         <option value="materiel">Matériel</option>
                         <option value="applicatif">Applicatif</option>
                       </select>
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Capacité max de tickets simultanés</label>
                       <input
                         type="number"
                         name="max_tickets_capacity"
                         min="1"
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Notes</label>
                       <textarea
                         name="notes"
                         rows={3}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           resize: "vertical"
                         }}
                       />
                     </div>
                   </div>

                   <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px", gap: "12px" }}>
                     <button
                       type="button"
                       onClick={() => setShowCreateTechnicianModal(false)}
                       style={{
                         padding: "10px 20px",
                         background: "#6c757d",
                         color: "white",
                         border: "none",
                         borderRadius: "5px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       Annuler
                     </button>
                     <button
                       type="submit"
                       disabled={loading}
                       style={{
                         padding: "10px 20px",
                         background: "#28a745",
                         color: "white",
                         border: "none",
                         borderRadius: "5px",
                         cursor: "pointer",
                         fontSize: "14px",
                         opacity: loading ? 0.7 : 1
                       }}
                     >
                       {loading ? "Création..." : "Créer"}
                     </button>
                   </div>
                 </form>
               </div>
             </div>
           )}

           {/* Modal Modifier un technicien */}
           {showEditTechnicianModal && editingTechnician && (
             <div style={{
               position: "fixed",
               top: 0,
               left: 0,
               width: "100%",
               height: "100%",
               background: "rgba(0, 0, 0, 0.5)",
               display: "flex",
               justifyContent: "center",
               alignItems: "center",
               zIndex: 1000,
             }}>
               <div style={{
                 background: "white",
                 padding: "30px",
                 borderRadius: "10px",
                 boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
                 width: "90%",
                 maxWidth: "500px",
                 position: "relative",
                 maxHeight: "90vh",
                 overflowY: "auto"
               }}>
                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                   <h2 style={{ fontSize: "24px", fontWeight: "600", color: "#333", margin: 0 }}>Modifier le Technicien</h2>
                   <button
                     onClick={() => {
                       setShowEditTechnicianModal(false);
                       setEditingTechnician(null);
                     }}
                     style={{
                       background: "transparent",
                       border: "none",
                       fontSize: "24px",
                       cursor: "pointer",
                       color: "#999",
                       padding: "0",
                       width: "30px",
                       height: "30px",
                       display: "flex",
                       alignItems: "center",
                       justifyContent: "center"
                     }}
                   >
                     ×
                   </button>
                 </div>

                 <form onSubmit={async (e) => {
                   e.preventDefault();
                   if (!editingTechnician || !token) return;
                   
                   setLoading(true);
                   try {
                     const updateData: any = {
                       full_name: (e.target as any).full_name.value,
                       email: (e.target as any).email.value,
                       phone: (e.target as any).phone.value || null,
                       agency: (e.target as any).agency.value || null,
                       specialization: (e.target as any).specialization.value || null,
                       max_tickets_capacity: (e.target as any).max_tickets_capacity?.value ? parseInt((e.target as any).max_tickets_capacity.value) : null,
                       notes: (e.target as any).notes?.value || null
                     };

                     const res = await fetch(`http://localhost:8000/users/${editingTechnician.id}`, {
                       method: "PUT",
                       headers: {
                         "Content-Type": "application/json",
                         Authorization: `Bearer ${token}`,
                       },
                       body: JSON.stringify(updateData),
                     });

                     if (res.ok) {
                       alert("Technicien modifié avec succès");
                       setShowEditTechnicianModal(false);
                       setEditingTechnician(null);
                       // Recharger les techniciens
                       const techRes = await fetch("http://localhost:8000/users/technicians", {
                         headers: {
                           Authorization: `Bearer ${token}`,
                         },
                       });
                       if (techRes.ok) {
                         const techData = await techRes.json();
                         const techsWithStats = await Promise.all(
                           techData.map(async (tech: any) => {
                             try {
                               const statsRes = await fetch(`http://localhost:8000/users/technicians/${tech.id}/stats`, {
                                 headers: {
                                   Authorization: `Bearer ${token}`,
                                 },
                               });
                               if (statsRes.ok) {
                                 const stats = await statsRes.json();
                                 return { ...tech, ...stats };
                               }
                             } catch (err) {
                               console.error(`Erreur stats pour ${tech.id}:`, err);
                             }
                            return { ...tech, workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
                           })
                         );
                         setTechnicians(techsWithStats);
                       }
                     } else {
                       const error = await res.json();
                       alert(`Erreur: ${error.detail || "Impossible de modifier le technicien"}`);
                     }
                   } catch (err) {
                     console.error("Erreur:", err);
                     alert("Une erreur est survenue lors de la modification");
                   } finally {
                     setLoading(false);
                   }
                 }}>
                   <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Nom complet *</label>
                       <input
                         type="text"
                         name="full_name"
                         defaultValue={editingTechnician.full_name}
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Email *</label>
                       <input
                         type="email"
                         name="email"
                         defaultValue={editingTechnician.email}
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Téléphone</label>
                       <input
                         type="tel"
                         name="phone"
                         defaultValue={editingTechnician.phone || ""}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Agence</label>
                       <input
                         type="text"
                         name="agency"
                         defaultValue={editingTechnician.agency || ""}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Spécialisation *</label>
                       <select
                         name="specialization"
                         defaultValue={editingTechnician.specialization || ""}
                         required
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           background: "white"
                         }}
                       >
                         <option value="">Sélectionner...</option>
                         <option value="materiel">Matériel</option>
                         <option value="applicatif">Applicatif</option>
                       </select>
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Capacité max de tickets simultanés</label>
                       <input
                         type="number"
                         name="max_tickets_capacity"
                         min="1"
                         defaultValue={editingTechnician.max_tickets_capacity || ""}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px"
                         }}
                       />
                     </div>
                     <div>
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Notes</label>
                       <textarea
                         name="notes"
                         rows={3}
                         defaultValue={editingTechnician.notes || ""}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           resize: "vertical"
                         }}
                       />
                     </div>
                   </div>

                   <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px", gap: "12px" }}>
                     <button
                       type="button"
                       onClick={() => {
                         setShowEditTechnicianModal(false);
                         setEditingTechnician(null);
                       }}
                       style={{
                         padding: "10px 20px",
                         background: "#6c757d",
                         color: "white",
                         border: "none",
                         borderRadius: "5px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       Annuler
                     </button>
                     <button
                       type="submit"
                       disabled={loading}
                       style={{
                         padding: "10px 20px",
                         background: "#007bff",
                         color: "white",
                         border: "none",
                         borderRadius: "5px",
                         cursor: "pointer",
                         fontSize: "14px",
                         opacity: loading ? 0.7 : 1
                       }}
                     >
                       {loading ? "Modification..." : "Modifier"}
                     </button>
                   </div>
                 </form>
               </div>
             </div>
           )}

           {/* Modal Confirmation Suppression */}
           {showDeleteConfirmModal && technicianToDelete && (
             <div style={{
               position: "fixed",
               top: 0,
               left: 0,
               width: "100%",
               height: "100%",
               background: "rgba(0, 0, 0, 0.5)",
               display: "flex",
               justifyContent: "center",
               alignItems: "center",
               zIndex: 1000,
             }}>
               <div style={{
                 background: "white",
                 padding: "30px",
                 borderRadius: "10px",
                 boxShadow: "0 5px 15px rgba(0, 0, 0, 0.3)",
                 width: "90%",
                 maxWidth: "400px",
                 position: "relative"
               }}>
                 <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#333", marginBottom: "16px" }}>Confirmer la suppression</h2>
                 <p style={{ color: "#666", marginBottom: "24px" }}>
                   Êtes-vous sûr de vouloir supprimer le technicien <strong>{technicianToDelete.full_name}</strong> ? Cette action est irréversible.
                 </p>
                 <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                   <button
                     onClick={() => {
                       setShowDeleteConfirmModal(false);
                       setTechnicianToDelete(null);
                     }}
                     style={{
                       padding: "10px 20px",
                       background: "#6c757d",
                       color: "white",
                       border: "none",
                       borderRadius: "5px",
                       cursor: "pointer",
                       fontSize: "14px"
                     }}
                   >
                     Annuler
                   </button>
                   <button
                     onClick={async () => {
                       if (!technicianToDelete || !token) return;
                       
                       setLoading(true);
                       try {
                         const res = await fetch(`http://localhost:8000/users/${technicianToDelete.id}`, {
                           method: "DELETE",
                           headers: {
                             Authorization: `Bearer ${token}`,
                           },
                         });

                         if (res.ok) {
                           alert("Technicien supprimé avec succès");
                           setShowDeleteConfirmModal(false);
                           setTechnicianToDelete(null);
                           // Recharger les techniciens
                           const techRes = await fetch("http://localhost:8000/users/technicians", {
                             headers: {
                               Authorization: `Bearer ${token}`,
                             },
                           });
                           if (techRes.ok) {
                             const techData = await techRes.json();
                             const techsWithStats = await Promise.all(
                               techData.map(async (tech: any) => {
                                 try {
                                   const statsRes = await fetch(`http://localhost:8000/users/technicians/${tech.id}/stats`, {
                                     headers: {
                                       Authorization: `Bearer ${token}`,
                                     },
                                   });
                                   if (statsRes.ok) {
                                     const stats = await statsRes.json();
                                     return { ...tech, ...stats };
                                   }
                                 } catch (err) {
                                   console.error(`Erreur stats pour ${tech.id}:`, err);
                                 }
                                return { ...tech, workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
                               })
                             );
                             setTechnicians(techsWithStats);
                           }
                         } else {
                           const error = await res.json();
                           alert(`Erreur: ${error.detail || "Impossible de supprimer le technicien"}`);
                         }
                       } catch (err) {
                         console.error("Erreur:", err);
                         alert("Une erreur est survenue lors de la suppression");
                       } finally {
                         setLoading(false);
                       }
                     }}
                     disabled={loading}
                     style={{
                       padding: "10px 20px",
                       background: "#dc3545",
                       color: "white",
                       border: "none",
                       borderRadius: "5px",
                       cursor: "pointer",
                       fontSize: "14px",
                       opacity: loading ? 0.7 : 1
                     }}
                   >
                     {loading ? "Suppression..." : "Supprimer"}
                   </button>
                 </div>
               </div>
             </div>
           )}

           {activeSection === "apparence" && (
               <div style={{ padding: "24px" }}>
                 <h1 style={{ marginBottom: "32px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                   Apparence
                 </h1>

                 {/* Nom de l'Application */}
                 <div style={{ 
                   marginBottom: "32px", 
                   border: "1px solid #ddd", 
                   borderRadius: "8px", 
                   padding: "24px",
                   background: "white"
                 }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>
                     Nom de l'Application
                   </h3>
                   <input
                     type="text"
                     value={localAppName}
                     onChange={(e) => setLocalAppName(e.target.value)}
                     placeholder="Système de Gestion des Tickets_______"
                     style={{
                       width: "100%",
                       padding: "12px 16px",
                       border: "1px solid #ddd",
                       borderRadius: "4px",
                       fontSize: "14px",
                       marginBottom: "8px"
                     }}
                   />
                   <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
                     Ce nom apparaît dans l'en-tête de l'application
                   </p>
                 </div>

                 {/* Logo de l'Application */}
                 <div style={{ 
                   marginBottom: "32px", 
                   border: "1px solid #ddd", 
                   borderRadius: "8px", 
                   padding: "24px",
                   background: "white"
                 }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>
                     Logo de l'Application
                   </h3>
                   {localAppLogo && (
                     <div style={{ marginBottom: "12px" }}>
                       <img 
                         src={localAppLogo} 
                         alt="Logo actuel" 
                         style={{ maxWidth: "200px", maxHeight: "100px", marginBottom: "12px" }}
                       />
                     </div>
                   )}
                   <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                     {localAppLogo && (
                       <button
                         onClick={() => {
                           const newWindow = window.open();
                           if (newWindow) {
                             newWindow.document.write(`<img src="${localAppLogo}" style="max-width: 100%;" />`);
                           }
                         }}
                         style={{
                           padding: "8px 16px",
                           backgroundColor: "#f8f9fa",
                           color: "#333",
                           border: "1px solid #ddd",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         [Logo actuel]
                       </button>
                     )}
                     <button
                       onClick={() => fileInputRef.current?.click()}
                       style={{
                         padding: "8px 16px",
                         backgroundColor: "#007bff",
                         color: "white",
                         border: "none",
                         borderRadius: "4px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       [Télécharger nouveau logo]
                     </button>
                     <input
                       ref={fileInputRef}
                       type="file"
                       accept="image/png,image/jpeg,image/jpg"
                       onChange={handleLogoUpload}
                       style={{ display: "none" }}
                     />
                     {localAppLogo && (
                       <button
                         onClick={handleDeleteLogo}
                         style={{
                           padding: "8px 16px",
                           backgroundColor: "#dc3545",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         [Supprimer]
                       </button>
                     )}
                   </div>
                   <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
                     Format accepté : PNG, JPG (Max <span style={{ color: "#007bff" }}>2MB</span>)
                   </p>
                 </div>

                 {/* Thème */}
                 <div style={{ 
                   marginBottom: "32px", 
                   border: "1px solid #ddd", 
                   borderRadius: "8px", 
                   padding: "24px",
                   background: "white"
                 }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>
                     <span style={{ color: "#dc3545" }}>Thème</span>
                   </h3>
                   <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="theme"
                         value="clair"
                         checked={localAppTheme === "clair"}
                         onChange={(e) => setLocalAppTheme(e.target.value)}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Clair</span>
                     </label>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="theme"
                         value="sombre"
                         checked={localAppTheme === "sombre"}
                         onChange={(e) => setLocalAppTheme(e.target.value)}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Sombre</span>
                     </label>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="theme"
                         value="auto"
                         checked={localAppTheme === "auto"}
                         onChange={(e) => setLocalAppTheme(e.target.value)}
                         style={{ cursor: "pointer" }}
                       />
                       <span><span style={{ color: "#dc3545" }}>Auto</span> (selon les préférences du <span style={{ color: "#dc3545" }}>système</span>)</span>
                     </label>
                   </div>
                 </div>

                 {/* Couleur Primaire */}
                 <div style={{ 
                   marginBottom: "32px", 
                   border: "1px solid #ddd", 
                   borderRadius: "8px", 
                   padding: "24px",
                   background: "white"
                 }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>
                     Couleur Primaire
                   </h3>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                     <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <div style={{ 
                         width: "24px", 
                         height: "24px", 
                         backgroundColor: localPrimaryColor, 
                         borderRadius: "4px",
                         border: "1px solid #ddd"
                       }}></div>
                       <span style={{ fontSize: "14px", color: "#333" }}>[■ {getColorName(localPrimaryColor)}]</span>
                     </div>
                     <input
                       type="color"
                       value={localPrimaryColor}
                       onChange={(e) => setLocalPrimaryColor(e.target.value)}
                       style={{
                         width: "40px",
                         height: "40px",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         cursor: "pointer"
                       }}
                     />
                     <button
                       onClick={() => setShowColorPicker(!showColorPicker)}
                       style={{
                         padding: "8px 16px",
                         backgroundColor: "#f8f9fa",
                         color: "#333",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       [Sélectionner une couleur]
                     </button>
                   </div>
                   {showColorPicker && (
                     <div style={{ marginTop: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                       {["#007bff", "#28a745", "#dc3545", "#ffc107", "#6c757d", "#17a2b8", "#ff9800", "#9c27b0"].map((color) => (
                         <div
                           key={color}
                           onClick={() => {
                             setLocalPrimaryColor(color);
                             setShowColorPicker(false);
                           }}
                           style={{
                             width: "40px",
                             height: "40px",
                             backgroundColor: color,
                             borderRadius: "4px",
                             border: localPrimaryColor === color ? "3px solid #333" : "1px solid #ddd",
                             cursor: "pointer"
                           }}
                         />
                       ))}
                     </div>
                   )}
                 </div>

                 {/* Boutons d'action */}
                 <div style={{ 
                   display: "flex", 
                   justifyContent: "flex-end", 
                   gap: "12px",
                   marginTop: "32px",
                   paddingTop: "24px",
                   borderTop: "1px solid #eee"
                 }}>
                   <button
                     onClick={handleCancelAppearance}
                     style={{
                       padding: "10px 20px",
                       backgroundColor: "#6c757d",
                       color: "white",
                       border: "none",
                       borderRadius: "4px",
                       cursor: "pointer",
                       fontSize: "14px"
                     }}
                   >
                     [Annuler]
                   </button>
                   <button
                     onClick={handleSaveAppearance}
                     style={{
                       padding: "10px 20px",
                       backgroundColor: "#28a745",
                       color: "white",
                       border: "none",
                       borderRadius: "4px",
                       cursor: "pointer",
                       fontSize: "14px"
                     }}
                   >
                     [Enregistrer]
                   </button>
                 </div>
               </div>
           )}

           {activeSection === "types-tickets" && (
             <div style={{ padding: "24px" }}>
               <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                 Types de Tickets
               </h1>

               {/* Bouton Ajouter */}
               <div style={{ marginBottom: "24px" }}>
                 <button
                   onClick={() => {
                     setNewType({ type: "", description: "", color: "#007bff" });
                     setEditingType(null);
                     setShowAddTypeModal(true);
                   }}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "white",
                     color: "#007bff",
                     border: "1px solid #007bff",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: "500"
                   }}
                 >
                   [+ Ajouter un type]
                 </button>
               </div>

               {/* Tableau des types */}
               <div style={{ 
                 background: "white", 
                 borderRadius: "8px", 
                 boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                 overflow: "hidden"
               }}>
                 <table style={{ width: "100%", borderCollapse: "collapse" }}>
                   <thead>
                     <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Type</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Description</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Couleur</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {ticketTypes.map((ticketType) => (
                       <tr key={ticketType.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                         <td style={{ padding: "12px 16px", color: "#333" }}>{ticketType.type}</td>
                         <td style={{ padding: "12px 16px", color: "#333" }}>
                           {ticketType.description.includes("d'accès") ? (
                             <>
                               {ticketType.description.split("d'accès")[0]}
                               <span style={{ color: "#ff9800" }}>d'accès</span>
                               {ticketType.description.split("d'accès")[1]}
                             </>
                           ) : (
                             ticketType.description
                           )}
                         </td>
                         <td style={{ padding: "12px 16px" }}>
                           <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                             <div style={{
                               width: "20px",
                               height: "20px",
                               borderRadius: "50%",
                               backgroundColor: ticketType.color,
                               border: "1px solid #ddd"
                             }}></div>
                             <span style={{ color: "#333" }}>{getTypeColorName(ticketType.color)}</span>
                           </div>
                         </td>
                         <td style={{ padding: "12px 16px" }}>
                           <div style={{ display: "flex", gap: "12px" }}>
                             <button
                               onClick={() => handleEditType(ticketType.id)}
                               style={{
                                 padding: "0",
                                 backgroundColor: "transparent",
                                 border: "none",
                                 cursor: "pointer",
                                 display: "flex",
                                 alignItems: "center",
                                 justifyContent: "center",
                                 width: "28px",
                                 height: "28px"
                               }}
                               title="Modifier"
                             >
                               <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                 {/* Crayon jaune */}
                                 <path d="M6 22L2 18L10 10L14 14L6 22Z" fill="#ffc107" stroke="#d4a574" strokeWidth="0.8"/>
                                 <path d="M2 18L6 22L2 22L2 18Z" fill="#d4a574"/>
                                 <path d="M10 10L14 14L10 14L10 10Z" fill="#ffeb3b"/>
                                 {/* Pointe grise */}
                                 <path d="M2 18L6 22L2 22Z" fill="#757575"/>
                                 {/* Gomme rose */}
                                 <rect x="20" y="2" width="4" height="4" rx="0.5" fill="#ffb3d9" stroke="#ff91c7" strokeWidth="0.5"/>
                                 {/* Bande métallique bleue */}
                                 <rect x="19" y="5" width="6" height="1.5" fill="#87ceeb"/>
                               </svg>
                             </button>
                             <button
                               onClick={() => handleDeleteType(ticketType.id)}
                               style={{
                                 padding: "0",
                                 backgroundColor: "transparent",
                                 border: "none",
                                 cursor: "pointer",
                                 display: "flex",
                                 alignItems: "center",
                                 justifyContent: "center",
                                 width: "28px",
                                 height: "28px"
                               }}
                               title="Supprimer"
                             >
                               <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                 {/* Poubelle bleue claire avec motif grille */}
                                 <rect x="7" y="6" width="14" height="16" rx="1.5" fill="#87ceeb" stroke="#5ba3d4" strokeWidth="1.2"/>
                                 {/* Motif de grille */}
                                 <line x1="10" y1="8" x2="10" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="14" y1="8" x2="14" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="18" y1="8" x2="18" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="10" x2="20" y2="10" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="13" x2="20" y2="13" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="16" x2="20" y2="16" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="19" x2="20" y2="19" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 {/* Bord supérieur */}
                                 <rect x="9" y="3" width="10" height="3" rx="0.5" fill="#5ba3d4"/>
                               </svg>
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>

               {/* Modal Ajouter/Modifier un type */}
               {showAddTypeModal && (
                 <div 
                   onClick={() => {
                     setShowAddTypeModal(false);
                     setEditingType(null);
                     setNewType({ type: "", description: "", color: "#007bff" });
                   }}
                   style={{
                     position: "fixed",
                     top: 0,
                     left: 0,
                     right: 0,
                     bottom: 0,
                     background: "rgba(0,0,0,0.5)",
                     display: "flex",
                     alignItems: "center",
                     justifyContent: "center",
                     zIndex: 1000,
                     padding: "20px"
                   }}
                 >
                   <div 
                     onClick={(e) => e.stopPropagation()}
                     style={{
                       background: "white",
                       borderRadius: "12px",
                       width: "100%",
                       maxWidth: "500px",
                       boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                       padding: "24px"
                     }}
                   >
                     <h2 style={{ marginBottom: "24px", fontSize: "24px", fontWeight: "600", color: "#333" }}>
                       {editingType ? "Modifier le type" : "Ajouter un type"}
                     </h2>
                     
                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Type <span style={{ color: "#dc3545" }}>*</span>
                       </label>
                       <input
                         type="text"
                         value={newType.type}
                         onChange={(e) => setNewType({ ...newType, type: e.target.value })}
                         placeholder="Ex: Matériel"
                         style={{
                           width: "100%",
                           padding: "10px 12px",
                           border: "1px solid #ddd",
                           borderRadius: "4px",
                           fontSize: "14px"
                         }}
                       />
                     </div>

                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Description <span style={{ color: "#dc3545" }}>*</span>
                       </label>
                       <input
                         type="text"
                         value={newType.description}
                         onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                         placeholder="Ex: Problèmes matériels"
                         style={{
                           width: "100%",
                           padding: "10px 12px",
                           border: "1px solid #ddd",
                           borderRadius: "4px",
                           fontSize: "14px"
                         }}
                       />
                     </div>

                     <div style={{ marginBottom: "24px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Couleur
                       </label>
                       <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                         <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                           <div style={{
                             width: "30px",
                             height: "30px",
                             borderRadius: "50%",
                             backgroundColor: newType.color,
                             border: "1px solid #ddd"
                           }}></div>
                           <input
                             type="color"
                             value={newType.color}
                             onChange={(e) => setNewType({ ...newType, color: e.target.value })}
                             style={{
                               width: "50px",
                               height: "40px",
                               border: "1px solid #ddd",
                               borderRadius: "4px",
                               cursor: "pointer"
                             }}
                           />
                         </div>
                         <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                           {["#dc3545", "#28a745", "#ffc107", "#9c27b0", "#6c757d", "#007bff", "#17a2b8", "#ff9800"].map((color) => (
                             <div
                               key={color}
                               onClick={() => setNewType({ ...newType, color })}
                               style={{
                                 width: "30px",
                                 height: "30px",
                                 borderRadius: "50%",
                                 backgroundColor: color,
                                 border: newType.color === color ? "3px solid #333" : "1px solid #ddd",
                                 cursor: "pointer"
                               }}
                             />
                           ))}
                         </div>
                       </div>
                     </div>

                     <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                       <button
                         onClick={() => {
                           setShowAddTypeModal(false);
                           setEditingType(null);
                           setNewType({ type: "", description: "", color: "#007bff" });
                         }}
                         style={{
                           padding: "10px 20px",
                           backgroundColor: "#6c757d",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         Annuler
                       </button>
                       <button
                         onClick={editingType ? handleUpdateType : handleAddType}
                         style={{
                           padding: "10px 20px",
                           backgroundColor: "#28a745",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         {editingType ? "Modifier" : "Ajouter"}
                       </button>
                     </div>
                   </div>
                 </div>
               )}
             </div>
           )}

           {activeSection === "priorites" && (
             <div style={{ padding: "24px" }}>
               <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                 Priorités
               </h1>

               {/* Bouton Ajouter */}
               <div style={{ marginBottom: "24px" }}>
                 <button
                   onClick={() => {
                     setNewPriority({ priority: "", level: 1, color: "#dc3545", maxTimeValue: 1, maxTimeUnit: "heure" });
                     setEditingPriority(null);
                     setShowAddPriorityModal(true);
                   }}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "white",
                     color: "#007bff",
                     border: "1px solid #007bff",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: "500"
                   }}
                 >
                   [+ Ajouter une priorité]
                 </button>
               </div>

               {/* Tableau des priorités */}
               <div style={{ 
                 background: "white", 
                 borderRadius: "8px", 
                 boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                 overflow: "hidden"
               }}>
                 <table style={{ width: "100%", borderCollapse: "collapse" }}>
                   <thead>
                     <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Priorité</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Niveau</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Couleur</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Temps Max</th>
                       <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "1px solid #dee2e6" }}>Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     {priorities.map((priority) => (
                       <tr key={priority.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                         <td style={{ padding: "12px 16px", color: "#333" }}>{priority.priority}</td>
                         <td style={{ padding: "12px 16px", color: "#007bff", fontWeight: "500" }}>{priority.level}</td>
                         <td style={{ padding: "12px 16px" }}>
                           <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                             <div style={{
                               width: "20px",
                               height: "20px",
                               borderRadius: "50%",
                               backgroundColor: priority.color,
                               border: "1px solid #ddd"
                             }}></div>
                             <span style={{ color: "#333" }}>{getPriorityColorName(priority.color)}</span>
                           </div>
                         </td>
                         <td style={{ padding: "12px 16px" }}>
                           <span style={{ color: "#333" }}>
                             <span style={{ color: "#007bff", fontWeight: "500" }}>{priority.maxTimeValue}</span> {priority.maxTimeUnit}
                           </span>
                         </td>
                         <td style={{ padding: "12px 16px" }}>
                           <div style={{ display: "flex", gap: "12px" }}>
                             <button
                               onClick={() => handleEditPriority(priority.id)}
                               style={{
                                 padding: "0",
                                 backgroundColor: "transparent",
                                 border: "none",
                                 cursor: "pointer",
                                 display: "flex",
                                 alignItems: "center",
                                 justifyContent: "center",
                                 width: "28px",
                                 height: "28px"
                               }}
                               title="Modifier"
                             >
                               <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                 {/* Crayon jaune */}
                                 <path d="M6 22L2 18L10 10L14 14L6 22Z" fill="#ffc107" stroke="#d4a574" strokeWidth="0.8"/>
                                 <path d="M2 18L6 22L2 22L2 18Z" fill="#d4a574"/>
                                 <path d="M10 10L14 14L10 14L10 10Z" fill="#ffeb3b"/>
                                 <path d="M2 18L6 22L2 22Z" fill="#757575"/>
                                 <rect x="20" y="2" width="4" height="4" rx="0.5" fill="#ffb3d9" stroke="#ff91c7" strokeWidth="0.5"/>
                                 <rect x="19" y="5" width="6" height="1.5" fill="#87ceeb"/>
                               </svg>
                             </button>
                             <button
                               onClick={() => handleDeletePriority(priority.id)}
                               style={{
                                 padding: "0",
                                 backgroundColor: "transparent",
                                 border: "none",
                                 cursor: "pointer",
                                 display: "flex",
                                 alignItems: "center",
                                 justifyContent: "center",
                                 width: "28px",
                                 height: "28px"
                               }}
                               title="Supprimer"
                             >
                               <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                                 {/* Poubelle bleue claire avec motif grille */}
                                 <rect x="7" y="6" width="14" height="16" rx="1.5" fill="#87ceeb" stroke="#5ba3d4" strokeWidth="1.2"/>
                                 <line x1="10" y1="8" x2="10" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="14" y1="8" x2="14" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="18" y1="8" x2="18" y2="20" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="10" x2="20" y2="10" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="13" x2="20" y2="13" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="16" x2="20" y2="16" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <line x1="8" y1="19" x2="20" y2="19" stroke="#5ba3d4" strokeWidth="0.6" opacity="0.7"/>
                                 <rect x="9" y="3" width="10" height="3" rx="0.5" fill="#5ba3d4"/>
                               </svg>
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>

               {/* Note */}
               <div style={{ marginTop: "24px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                 <p style={{ margin: 0, fontSize: "14px", color: "#666", fontStyle: "italic" }}>
                   Note : Les temps max sont utilisés pour générer des alertes
                 </p>
               </div>

               {/* Modal Ajouter/Modifier une priorité */}
               {showAddPriorityModal && (
                 <div 
                   onClick={() => {
                     setShowAddPriorityModal(false);
                     setEditingPriority(null);
                     setNewPriority({ priority: "", level: 1, color: "#dc3545", maxTimeValue: 1, maxTimeUnit: "heure" });
                   }}
                   style={{
                     position: "fixed",
                     top: 0,
                     left: 0,
                     right: 0,
                     bottom: 0,
                     background: "rgba(0,0,0,0.5)",
                     display: "flex",
                     alignItems: "center",
                     justifyContent: "center",
                     zIndex: 1000,
                     padding: "20px"
                   }}
                 >
                   <div 
                     onClick={(e) => e.stopPropagation()}
                     style={{
                       background: "white",
                       borderRadius: "12px",
                       width: "100%",
                       maxWidth: "500px",
                       boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                       padding: "24px"
                     }}
                   >
                     <h2 style={{ marginBottom: "24px", fontSize: "24px", fontWeight: "600", color: "#333" }}>
                       {editingPriority ? "Modifier la priorité" : "Ajouter une priorité"}
                     </h2>
                     
                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Priorité <span style={{ color: "#dc3545" }}>*</span>
                       </label>
                       <input
                         type="text"
                         value={newPriority.priority}
                         onChange={(e) => setNewPriority({ ...newPriority, priority: e.target.value })}
                         placeholder="Ex: Critique"
                         style={{
                           width: "100%",
                           padding: "10px 12px",
                           border: "1px solid #ddd",
                           borderRadius: "4px",
                           fontSize: "14px"
                         }}
                       />
                     </div>

                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Niveau <span style={{ color: "#dc3545" }}>*</span>
                       </label>
                       <input
                         type="number"
                         min="1"
                         value={newPriority.level}
                         onChange={(e) => setNewPriority({ ...newPriority, level: parseInt(e.target.value) || 1 })}
                         style={{
                           width: "100%",
                           padding: "10px 12px",
                           border: "1px solid #ddd",
                           borderRadius: "4px",
                           fontSize: "14px"
                         }}
                       />
                     </div>

                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Couleur
                       </label>
                       <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                         <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                           <div style={{
                             width: "30px",
                             height: "30px",
                             borderRadius: "50%",
                             backgroundColor: newPriority.color,
                             border: "1px solid #ddd"
                           }}></div>
                           <input
                             type="color"
                             value={newPriority.color}
                             onChange={(e) => setNewPriority({ ...newPriority, color: e.target.value })}
                             style={{
                               width: "50px",
                               height: "40px",
                               border: "1px solid #ddd",
                               borderRadius: "4px",
                               cursor: "pointer"
                             }}
                           />
                         </div>
                         <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                           {["#dc3545", "#ff9800", "#ffc107", "#28a745", "#007bff", "#6c757d", "#9c27b0"].map((color) => (
                             <div
                               key={color}
                               onClick={() => setNewPriority({ ...newPriority, color })}
                               style={{
                                 width: "30px",
                                 height: "30px",
                                 borderRadius: "50%",
                                 backgroundColor: color,
                                 border: newPriority.color === color ? "3px solid #333" : "1px solid #ddd",
                                 cursor: "pointer"
                               }}
                             />
                           ))}
                         </div>
                       </div>
                     </div>

                     <div style={{ marginBottom: "24px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Temps Max <span style={{ color: "#dc3545" }}>*</span>
                       </label>
                       <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                         <input
                           type="number"
                           min="1"
                           value={newPriority.maxTimeValue}
                           onChange={(e) => setNewPriority({ ...newPriority, maxTimeValue: parseInt(e.target.value) || 1 })}
                           style={{
                             width: "100px",
                             padding: "10px 12px",
                             border: "1px solid #ddd",
                             borderRadius: "4px",
                             fontSize: "14px"
                           }}
                         />
                         <select
                           value={newPriority.maxTimeUnit}
                           onChange={(e) => setNewPriority({ ...newPriority, maxTimeUnit: e.target.value })}
                           style={{
                             padding: "10px 12px",
                             border: "1px solid #ddd",
                             borderRadius: "4px",
                             fontSize: "14px"
                           }}
                         >
                           <option value="heure">heure</option>
                           <option value="heures">heures</option>
                           <option value="jour">jour</option>
                           <option value="jours">jours</option>
                         </select>
                       </div>
                     </div>

                     <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                       <button
                         onClick={() => {
                           setShowAddPriorityModal(false);
                           setEditingPriority(null);
                           setNewPriority({ priority: "", level: 1, color: "#dc3545", maxTimeValue: 1, maxTimeUnit: "heure" });
                         }}
                         style={{
                           padding: "10px 20px",
                           backgroundColor: "#6c757d",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         Annuler
                       </button>
                       <button
                         onClick={editingPriority ? handleUpdatePriority : handleAddPriority}
                         style={{
                           padding: "10px 20px",
                           backgroundColor: "#28a745",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         {editingPriority ? "Modifier" : "Ajouter"}
                       </button>
                     </div>
                   </div>
                 </div>
               )}
             </div>
           )}

           {activeSection === "email" && (
             <div style={{ padding: "24px" }}>
               <h1 style={{ marginBottom: "32px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                 Configuration Email
               </h1>

               {/* Navigation par onglets */}
               <div style={{ 
                 display: "flex", 
                 gap: "8px", 
                 marginBottom: "24px", 
                 borderBottom: "2px solid #e0e0e0" 
               }}>
                 <button
                   onClick={() => setEmailSubSection("smtp")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "smtp" ? "#007bff" : "transparent",
                     color: emailSubSection === "smtp" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "smtp" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "smtp" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Configuration SMTP
                 </button>
                 <button
                   onClick={() => setEmailSubSection("templates")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "templates" ? "#007bff" : "transparent",
                     color: emailSubSection === "templates" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "templates" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "templates" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Templates Email
                 </button>
                 <button
                   onClick={() => setEmailSubSection("notifications")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "notifications" ? "#007bff" : "transparent",
                     color: emailSubSection === "notifications" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "notifications" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "notifications" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Notifications
                 </button>
                 <button
                   onClick={() => setEmailSubSection("frequency")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "frequency" ? "#007bff" : "transparent",
                     color: emailSubSection === "frequency" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "frequency" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "frequency" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Fréquence d'Envoi
                 </button>
                 <button
                   onClick={() => setEmailSubSection("test")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "test" ? "#007bff" : "transparent",
                     color: emailSubSection === "test" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "test" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "test" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Test
                 </button>
                 <button
                   onClick={() => setEmailSubSection("logs")}
                   style={{
                     padding: "12px 24px",
                     backgroundColor: emailSubSection === "logs" ? "#007bff" : "transparent",
                     color: emailSubSection === "logs" ? "white" : "#666",
                     border: "none",
                     borderBottom: emailSubSection === "logs" ? "2px solid #007bff" : "2px solid transparent",
                     cursor: "pointer",
                     fontSize: "14px",
                     fontWeight: emailSubSection === "logs" ? "600" : "400",
                     marginBottom: "-2px"
                   }}
                 >
                   Logs
                 </button>
               </div>

               {/* Section SERVEUR SMTP */}
               {emailSubSection === "smtp" && (
                 <>
               <div style={{ 
                 marginBottom: "32px", 
                 border: "1px solid #ddd", 
                 borderRadius: "8px", 
                 padding: "24px",
                 background: "white"
               }}>
                 <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                   SERVEUR SMTP
                 </h2>

                 {/* Fournisseur Email */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Fournisseur Email <span style={{ color: "#dc3545" }}>*</span>
                   </label>
                   <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                     <select
                       value={emailSettings.provider}
                       onChange={(e) => {
                         const provider = e.target.value;
                         setEmailSettings({
                           ...emailSettings,
                           provider,
                           smtpServer: provider === "gmail" ? "smtp.gmail.com" : 
                                      provider === "outlook" ? "smtp.office365.com" : 
                                      provider === "sendgrid" ? "smtp.sendgrid.net" :
                                      provider === "mailgun" ? "smtp.mailgun.org" : emailSettings.smtpServer,
                           smtpPort: provider === "gmail" ? "587" : 
                                    provider === "outlook" ? "587" : 
                                    provider === "sendgrid" ? "587" :
                                    provider === "mailgun" ? "587" : emailSettings.smtpPort
                         });
                       }}
                       style={{ 
                         width: "100%",
                         padding: "10px 32px 10px 12px", 
                         borderRadius: "4px", 
                         border: "1px solid #ddd", 
                         backgroundColor: "white", 
                         color: "#333", 
                         fontSize: "14px", 
                         cursor: "pointer",
                         appearance: "none",
                         WebkitAppearance: "none",
                         MozAppearance: "none"
                       }}
                     >
                       <option value="gmail">Gmail (Gmail SMTP)</option>
                       <option value="outlook">Outlook (Office 365)</option>
                       <option value="custom">Serveur SMTP personnalisé</option>
                       <option value="sendgrid">SendGrid</option>
                       <option value="mailgun">Mailgun</option>
                     </select>
                     <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }}>▼</span>
                   </div>
                 </div>

                 {/* Adresse Email d'Envoi */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Adresse Email d'Envoi <span style={{ color: "#dc3545" }}>*</span>
                   </label>
                   <input
                     type="email"
                     value={emailSettings.senderEmail}
                     onChange={(e) => setEmailSettings({ ...emailSettings, senderEmail: e.target.value })}
                     placeholder="tickets@entreprise.com"
                     style={{ 
                       width: "100%",
                       padding: "10px", 
                       borderRadius: "4px", 
                       border: "1px solid #ddd", 
                       backgroundColor: "white", 
                       color: "#333", 
                       fontSize: "14px"
                     }}
                   />
                   <p style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                     Cette adresse sera utilisée pour envoyer les emails
                   </p>
                 </div>

                 {/* Nom d'Affichage */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Nom d'Affichage <span style={{ color: "#dc3545" }}>*</span>
                   </label>
                   <input
                     type="text"
                     value={emailSettings.displayName}
                     onChange={(e) => setEmailSettings({ ...emailSettings, displayName: e.target.value })}
                     placeholder="Système de Gestion des Tickets"
                     style={{ 
                       width: "100%",
                       padding: "10px", 
                       borderRadius: "4px", 
                       border: "1px solid #ddd", 
                       backgroundColor: "white", 
                       color: "#333", 
                       fontSize: "14px"
                     }}
                   />
                   <p style={{ marginTop: "4px", fontSize: "12px", color: "#666" }}>
                     Le nom qui apparaîtra dans les emails reçus
                   </p>
                 </div>

                 {/* Serveur SMTP */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Serveur SMTP <span style={{ color: "#dc3545" }}>*</span>
                   </label>
                   <input
                     type="text"
                     value={emailSettings.smtpServer}
                     onChange={(e) => setEmailSettings({ ...emailSettings, smtpServer: e.target.value })}
                     placeholder="smtp.gmail.com"
                     style={{ 
                       width: "100%",
                       padding: "10px", 
                       borderRadius: "4px", 
                       border: "1px solid #ddd", 
                       backgroundColor: "white", 
                       color: "#333", 
                       fontSize: "14px"
                     }}
                   />
                 </div>

                 {/* Port SMTP */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Port SMTP <span style={{ color: "#dc3545" }}>*</span>
                   </label>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                     <div style={{ position: "relative", display: "inline-block", flex: "0 0 150px" }}>
                       <select
                         value={emailSettings.smtpPort}
                         onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: e.target.value })}
                         style={{ 
                           width: "100%",
                           padding: "10px 32px 10px 12px", 
                           borderRadius: "4px", 
                           border: "1px solid #ddd", 
                           backgroundColor: "white", 
                           color: "#333", 
                           fontSize: "14px", 
                           cursor: "pointer",
                           appearance: "none",
                           WebkitAppearance: "none",
                           MozAppearance: "none"
                         }}
                       >
                         <option value="587">587</option>
                         <option value="465">465</option>
                         <option value="25">25</option>
                         <option value="2525">2525</option>
                       </select>
                       <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#666", pointerEvents: "none" }}>▼</span>
                     </div>
                     <span style={{ fontSize: "12px", color: "#666" }}>(ou 465 pour SSL)</span>
                   </div>
                 </div>
               </div>

               {/* Section Authentification */}
               <div style={{ 
                 marginBottom: "32px", 
                 border: "1px solid #ddd", 
                 borderRadius: "8px", 
                 padding: "24px",
                 background: "white"
               }}>
                 <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                   Authentification
                 </h2>

                 {/* Type d'authentification */}
                 <div style={{ marginBottom: "20px" }}>
                   <label style={{ display: "block", marginBottom: "12px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                     Type d'authentification
                   </label>
                   <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="authType"
                         value="none"
                         checked={emailSettings.authType === "none"}
                         onChange={(e) => setEmailSettings({ ...emailSettings, authType: e.target.value })}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Aucune</span>
                     </label>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="authType"
                         value="password"
                         checked={emailSettings.authType === "password"}
                         onChange={(e) => setEmailSettings({ ...emailSettings, authType: e.target.value })}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Nom d'utilisateur et mot de passe</span>
                     </label>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="radio"
                         name="authType"
                         value="oauth"
                         checked={emailSettings.authType === "oauth"}
                         onChange={(e) => setEmailSettings({ ...emailSettings, authType: e.target.value })}
                         style={{ cursor: "pointer" }}
                       />
                       <span>OAuth 2.0</span>
                     </label>
                   </div>
                 </div>

                 {/* Nom d'Utilisateur SMTP */}
                 {emailSettings.authType !== "none" && (
                   <>
                     <div style={{ marginBottom: "20px" }}>
                       <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                         Nom d'Utilisateur SMTP
                       </label>
                       <input
                         type="text"
                         value={emailSettings.smtpUsername}
                         onChange={(e) => setEmailSettings({ ...emailSettings, smtpUsername: e.target.value })}
                         placeholder="tickets@entreprise.com"
                         style={{ 
                           width: "100%",
                           padding: "10px", 
                           borderRadius: "4px", 
                           border: "1px solid #ddd", 
                           backgroundColor: "white", 
                           color: "#333", 
                           fontSize: "14px"
                         }}
                       />
                     </div>

                     {/* Mot de Passe SMTP */}
                     {emailSettings.authType === "password" && (
                       <div style={{ marginBottom: "20px" }}>
                         <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                           Mot de Passe SMTP
                         </label>
                         <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                           <input
                             type={showPassword ? "text" : "password"}
                             value={emailSettings.smtpPassword}
                             onChange={(e) => setEmailSettings({ ...emailSettings, smtpPassword: e.target.value })}
                             placeholder="••••••••••••••••"
                             style={{ 
                               flex: 1,
                               padding: "10px", 
                               borderRadius: "4px", 
                               border: "1px solid #ddd", 
                               backgroundColor: "white", 
                               color: "#333", 
                               fontSize: "14px"
                             }}
                           />
                           <button
                             type="button"
                             onClick={() => setShowPassword(!showPassword)}
                             style={{
                               padding: "10px 16px",
                               backgroundColor: "#f8f9fa",
                               color: "#333",
                               border: "1px solid #ddd",
                               borderRadius: "4px",
                               cursor: "pointer",
                               fontSize: "14px"
                             }}
                           >
                             {showPassword ? "Masquer" : "Afficher"}
                           </button>
                         </div>
                       </div>
                     )}
                   </>
                 )}

                 {/* Checkboxes TLS/SSL */}
                 <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                   <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={emailSettings.useTLS}
                       onChange={(e) => setEmailSettings({ ...emailSettings, useTLS: e.target.checked })}
                       style={{ cursor: "pointer" }}
                     />
                     <span>Utiliser TLS/SSL</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={emailSettings.verifySSL}
                       onChange={(e) => setEmailSettings({ ...emailSettings, verifySSL: e.target.checked })}
                       style={{ cursor: "pointer" }}
                     />
                     <span>Vérifier le certificat SSL</span>
                   </label>
                 </div>
               </div>

               {/* Boutons d'action */}
               <div style={{ 
                 display: "flex", 
                 justifyContent: "flex-end", 
                 gap: "12px",
                 marginTop: "32px",
                 paddingTop: "24px",
                 borderTop: "1px solid #eee"
               }}>
                 <button
                   onClick={() => {
                     // Réinitialiser les valeurs
                     setEmailSettings({
                       provider: "gmail",
                       senderEmail: "tickets@entreprise.com",
                       displayName: "Système de Gestion des Tickets",
                       smtpServer: "smtp.gmail.com",
                       smtpPort: "587",
                       authType: "password",
                       smtpUsername: "tickets@entreprise.com",
                       smtpPassword: "",
                       useTLS: true,
                       verifySSL: true
                     });
                   }}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "#6c757d",
                     color: "white",
                     border: "none",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px"
                   }}
                 >
                   Annuler
                 </button>
                 <button
                   onClick={() => {
                     localStorage.setItem("emailSettings", JSON.stringify(emailSettings));
                     alert("Paramètres email enregistrés avec succès !");
                   }}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "#28a745",
                     color: "white",
                     border: "none",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px"
                   }}
                 >
                   Enregistrer
                 </button>
               </div>
                 </>
               )}

               {/* Section Templates Email */}
               {emailSubSection === "templates" && (
                 <div>
                   <h2 style={{ marginBottom: "16px", fontSize: "20px", fontWeight: "600", color: "#333", textAlign: "center" }}>
                     TEMPLATES EMAIL
                   </h2>
                   <p style={{ marginBottom: "24px", fontSize: "14px", color: "#666", textAlign: "center" }}>
                     Sélectionnez un <span style={{ color: "#dc3545" }}>template</span> à configurer :
                   </p>

                   <div style={{ background: "white", borderRadius: "8px", border: "1px solid #ddd", overflow: "hidden" }}>
                     <table style={{ width: "100%", borderCollapse: "collapse" }}>
                       <thead>
                         <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #ddd" }}>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333", borderRight: "1px solid #ddd" }}>Template</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333", borderRight: "1px solid #ddd" }}>Statut</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333" }}>Actions</th>
                         </tr>
                       </thead>
                       <tbody>
                         {emailTemplates.map((template) => (
                           <tr key={template.id} style={{ borderBottom: "1px solid #eee" }}>
                             <td style={{ padding: "12px", color: "#333" }}>{template.name}</td>
                             <td style={{ padding: "12px" }}>
                               <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#28a745" }}>
                                 <span style={{ fontSize: "16px" }}>✓</span>
                                 <span>Actif</span>
                               </span>
                             </td>
                             <td style={{ padding: "12px" }}>
                               <div style={{ display: "flex", gap: "12px" }}>
                                 <button
                                   onClick={() => {
                                     setSelectedTemplate(template);
                                     setTemplateForm({
                                       name: template.name,
                                       subject: `Votre ticket #{{TICKET_ID}} a été créé avec succès`,
                                       recipients: "creator",
                                       customRecipients: "",
                                       active: template.active,
                                       content: `Bonjour {{USER_NAME}},\n\nVotre ticket a été créé avec succès.\n\nDétails du Ticket :\n• Numéro : #{{TICKET_ID}}\n• Titre : {{TICKET_TITLE}}\n• Priorité : {{PRIORITY}}\n• Département : {{DEPARTMENT}}\n• Date de Création : {{CREATION_DATE}}\n\nVous pouvez suivre l'avancement de votre ticket en vous connectant à l'application.\n\nSi vous avez des questions, contactez-nous à :\n{{SUPPORT_EMAIL}}\n\nCordialement,\nÉquipe Support`
                                     });
                                     setShowTemplateEditor(true);
                                   }}
                                   style={{
                                     background: "none",
                                     border: "none",
                                     cursor: "pointer",
                                     padding: "4px 8px"
                                   }}
                                   title="Éditer"
                                 >
                                   <span style={{ fontSize: "18px" }}>✏️</span>
                                 </button>
                                 <button
                                   onClick={() => {
                                     // Aperçu
                                     alert(`Aperçu du template: ${template.name}`);
                                   }}
                                   style={{
                                     background: "none",
                                     border: "none",
                                     cursor: "pointer",
                                     padding: "4px 8px"
                                   }}
                                   title="Aperçu"
                                 >
                                   <span style={{ fontSize: "18px" }}>👁️</span>
                                 </button>
                                 <button
                                   onClick={() => {
                                     if (confirm(`Êtes-vous sûr de vouloir supprimer le template "${template.name}" ?`)) {
                                       setEmailTemplates(emailTemplates.filter(t => t.id !== template.id));
                                       localStorage.setItem("emailTemplates", JSON.stringify(emailTemplates.filter(t => t.id !== template.id)));
                                     }
                                   }}
                                   style={{
                                     background: "none",
                                     border: "none",
                                     cursor: "pointer",
                                     padding: "4px 8px"
                                   }}
                                   title="Supprimer"
                                 >
                                   <span style={{ fontSize: "18px" }}>🗑️</span>
                                 </button>
                               </div>
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>

                   {/* Modal d'édition de template */}
                   {showTemplateEditor && (
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
                         borderRadius: "8px",
                         padding: "24px",
                         width: "90%",
                         maxWidth: "800px",
                         maxHeight: "90vh",
                         overflow: "auto"
                       }}>
                         <h2 style={{ marginBottom: "8px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                           ÉDITER TEMPLATE EMAIL
                         </h2>
                         <p style={{ marginBottom: "24px", fontSize: "14px", color: "#666" }}>
                           {selectedTemplate?.name}
                         </p>

                         {/* Informations Générales */}
                         <div style={{ marginBottom: "24px" }}>
                           <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: "600", color: "#333" }}>
                             Informations Générales
                           </h3>
                           
                           <div style={{ marginBottom: "16px" }}>
                             <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                               Nom du Template <span style={{ color: "#dc3545" }}>*</span>
                             </label>
                             <input
                               type="text"
                               value={templateForm.name}
                               onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                               style={{
                                 width: "100%",
                                 padding: "10px",
                                 borderRadius: "4px",
                                 border: "1px solid #ddd",
                                 fontSize: "14px"
                               }}
                             />
                           </div>

                           <div style={{ marginBottom: "16px" }}>
                             <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                               Objet de l'Email <span style={{ color: "#dc3545" }}>*</span>
                             </label>
                             <input
                               type="text"
                               value={templateForm.subject}
                               onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                               style={{
                                 width: "100%",
                                 padding: "10px",
                                 borderRadius: "4px",
                                 border: "1px solid #ddd",
                                 fontSize: "14px"
                               }}
                             />
                           </div>

                           <div style={{ marginBottom: "16px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                             <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                               Variables disponibles :
                             </label>
                             <div style={{ fontSize: "12px", color: "#666", fontFamily: "monospace" }}>
                               {`{{TICKET_ID}} {{TICKET_TITLE}} {{USER_NAME}} {{USER_EMAIL}} {{DEPARTMENT}} {{PRIORITY}} {{CREATION_DATE}} {{SUPPORT_EMAIL}}`}
                             </div>
                           </div>

                           <div style={{ marginBottom: "16px" }}>
                             <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                               Destinataires <span style={{ color: "#dc3545" }}>*</span>
                             </label>
                             <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                               <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                 <input
                                   type="radio"
                                   name="recipients"
                                   value="creator"
                                   checked={templateForm.recipients === "creator"}
                                   onChange={(e) => setTemplateForm({ ...templateForm, recipients: e.target.value })}
                                 />
                                 <span>Utilisateur créateur du ticket</span>
                               </label>
                               <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                 <input
                                   type="radio"
                                   name="recipients"
                                   value="secretary"
                                   checked={templateForm.recipients === "secretary"}
                                   onChange={(e) => setTemplateForm({ ...templateForm, recipients: e.target.value })}
                                 />
                                 <span>Secrétaire/Adjoint DSI</span>
                               </label>
                               <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                 <input
                                   type="radio"
                                   name="recipients"
                                   value="technician"
                                   checked={templateForm.recipients === "technician"}
                                   onChange={(e) => setTemplateForm({ ...templateForm, recipients: e.target.value })}
                                 />
                                 <span>Technicien assigné</span>
                               </label>
                               <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                 <input
                                   type="radio"
                                   name="recipients"
                                   value="custom"
                                   checked={templateForm.recipients === "custom"}
                                   onChange={(e) => setTemplateForm({ ...templateForm, recipients: e.target.value })}
                                 />
                                 <span>Personnalisé :</span>
                                 {templateForm.recipients === "custom" && (
                                   <input
                                     type="text"
                                     value={templateForm.customRecipients}
                                     onChange={(e) => setTemplateForm({ ...templateForm, customRecipients: e.target.value })}
                                     placeholder="email@example.com"
                                     style={{
                                       flex: 1,
                                       padding: "8px",
                                       borderRadius: "4px",
                                       border: "1px solid #ddd",
                                       fontSize: "14px"
                                     }}
                                   />
                                 )}
                               </label>
                             </div>
                           </div>

                           <div style={{ marginBottom: "16px" }}>
                             <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                               <input
                                 type="checkbox"
                                 checked={templateForm.active}
                                 onChange={(e) => setTemplateForm({ ...templateForm, active: e.target.checked })}
                               />
                               <span>Envoyer cet email automatiquement</span>
                             </label>
                           </div>
                         </div>

                         {/* Contenu de l'Email */}
                         <div style={{ marginBottom: "24px" }}>
                           <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: "600", color: "#333" }}>
                             Contenu de l'Email
                           </h3>
                           <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "8px", background: "#f8f9fa" }}>
                             <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px", fontStyle: "italic" }}>
                               [Éditeur HTML/Texte Riche]
                             </div>
                             <textarea
                               value={templateForm.content}
                               onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                               rows={15}
                               style={{
                                 width: "100%",
                                 padding: "12px",
                                 borderRadius: "4px",
                                 border: "1px solid #ddd",
                                 fontSize: "14px",
                                 fontFamily: "monospace",
                                 resize: "vertical"
                               }}
                             />
                           </div>
                           <div style={{ marginTop: "16px", padding: "12px", background: "#e3f2fd", borderRadius: "4px", border: "1px solid #ddd" }}>
                             <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px" }}>Aperçu</div>
                             <div style={{ padding: "12px", background: "white", borderRadius: "4px", border: "1px solid #ddd", textAlign: "center", color: "#999" }}>
                               [Aperçu du rendu final de l'email]
                             </div>
                           </div>
                         </div>

                         <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                           <button
                             onClick={() => {
                               setShowTemplateEditor(false);
                               setSelectedTemplate(null);
                             }}
                             style={{
                               padding: "10px 20px",
                               backgroundColor: "#6c757d",
                               color: "white",
                               border: "none",
                               borderRadius: "4px",
                               cursor: "pointer",
                               fontSize: "14px"
                             }}
                           >
                             Annuler
                           </button>
                           <button
                             onClick={() => {
                               // Sauvegarder le template
                               const updatedTemplates = emailTemplates.map(t => 
                                 t.id === selectedTemplate?.id 
                                   ? { ...t, name: templateForm.name, active: templateForm.active }
                                   : t
                               );
                               setEmailTemplates(updatedTemplates);
                               localStorage.setItem("emailTemplates", JSON.stringify(updatedTemplates));
                               setShowTemplateEditor(false);
                               setSelectedTemplate(null);
                               alert("Template enregistré avec succès !");
                             }}
                             style={{
                               padding: "10px 20px",
                               backgroundColor: "#28a745",
                               color: "white",
                               border: "none",
                               borderRadius: "4px",
                               cursor: "pointer",
                               fontSize: "14px"
                             }}
                           >
                             Enregistrer
                           </button>
                         </div>
                       </div>
                     </div>
                   )}
                 </div>
               )}

               {/* Section Notifications Email */}
               {emailSubSection === "notifications" && (
                 <div>
                   <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333", textAlign: "center" }}>
                     NOTIFICATIONS EMAIL
                   </h2>
                   <div style={{ background: "white", borderRadius: "8px", border: "1px solid #ddd", overflow: "hidden" }}>
                     <div style={{ padding: "16px", background: "#f8f9fa", borderBottom: "1px solid #ddd" }}>
                       <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#333" }}>
                         Événements et Destinataires
                       </h3>
                     </div>
                     <table style={{ width: "100%", borderCollapse: "collapse" }}>
                       <thead>
                         <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #ddd" }}>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333", borderRight: "1px solid #ddd" }}>Événement</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333", borderRight: "1px solid #ddd" }}>Actif</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#333" }}>Destinataires</th>
                         </tr>
                       </thead>
                       <tbody>
                         {emailNotifications.map((notif, index) => (
                           <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                             <td style={{ padding: "12px", color: notif.event === "Alerte Système" ? "#dc3545" : "#333", fontWeight: notif.event === "Alerte Système" ? "600" : "400" }}>
                               {notif.event}
                             </td>
                             <td style={{ padding: "12px" }}>
                               <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                                 <input
                                   type="checkbox"
                                   checked={notif.active}
                                   onChange={(e) => {
                                     const updated = [...emailNotifications];
                                     updated[index].active = e.target.checked;
                                     setEmailNotifications(updated);
                                     localStorage.setItem("emailNotifications", JSON.stringify(updated));
                                   }}
                                 />
                                 {notif.active && <span style={{ color: "#28a745", fontSize: "16px" }}>✓</span>}
                               </label>
                             </td>
                             <td style={{ padding: "12px", color: "#333" }}>{notif.recipients}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 </div>
               )}

               {/* Section Fréquence d'Envoi */}
               {emailSubSection === "frequency" && (
                 <div>
                   <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                     Fréquence d'Envoi
                   </h2>
                   <div style={{ border: "2px dashed #007bff", borderRadius: "8px", padding: "24px", background: "white" }}>
                     <div style={{ marginBottom: "24px" }}>
                       <label style={{ display: "block", marginBottom: "12px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                         Envoyer les emails :
                       </label>
                       <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                         <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="frequency"
                             value="immediate"
                             checked={emailFrequency.frequency === "immediate"}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, frequency: e.target.value })}
                           />
                           <span>• Immédiatement</span>
                         </label>
                         <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="frequency"
                             value="grouped30"
                             checked={emailFrequency.frequency === "grouped30"}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, frequency: e.target.value })}
                           />
                           <span>o Grouper les emails (toutes les <span style={{ color: "#007bff" }}>30</span> minutes)</span>
                         </label>
                         <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="frequency"
                             value="grouped60"
                             checked={emailFrequency.frequency === "grouped60"}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, frequency: e.target.value })}
                           />
                           <span>o Grouper les emails (toutes les heures)</span>
                         </label>
                         <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="frequency"
                             value="daily"
                             checked={emailFrequency.frequency === "daily"}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, frequency: e.target.value })}
                           />
                           <span>o Grouper les emails (quotidiennement à <span style={{ color: "#007bff" }}>09:00</span>)</span>
                         </label>
                       </div>
                     </div>

                     <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #ddd" }}>
                       <label style={{ display: "block", marginBottom: "12px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                         Heures de Silence <span style={{ color: "#999" }}>(pas d'emails)</span>
                       </label>
                       <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                         <span>De :</span>
                         <div style={{ position: "relative", display: "inline-block" }}>
                           <select
                             value={emailFrequency.silenceFrom}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, silenceFrom: e.target.value })}
                             style={{
                               padding: "8px 32px 8px 12px",
                               borderRadius: "4px",
                               border: "1px solid #ddd",
                               fontSize: "14px",
                               appearance: "none"
                             }}
                           >
                             {Array.from({ length: 24 }, (_, i) => {
                               const hour = String(i).padStart(2, "0") + ":00";
                               return <option key={hour} value={hour}>{hour}</option>;
                             })}
                           </select>
                           <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>▼</span>
                         </div>
                         <span>À :</span>
                         <div style={{ position: "relative", display: "inline-block" }}>
                           <select
                             value={emailFrequency.silenceTo}
                             onChange={(e) => setEmailFrequency({ ...emailFrequency, silenceTo: e.target.value })}
                             style={{
                               padding: "8px 32px 8px 12px",
                               borderRadius: "4px",
                               border: "1px solid #ddd",
                               fontSize: "14px",
                               appearance: "none"
                             }}
                           >
                             {Array.from({ length: 24 }, (_, i) => {
                               const hour = String(i).padStart(2, "0") + ":00";
                               return <option key={hour} value={hour}>{hour}</option>;
                             })}
                           </select>
                           <span style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>▼</span>
                         </div>
                       </div>
                       <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                         <input
                           type="checkbox"
                           checked={emailFrequency.applyWeekend}
                           onChange={(e) => setEmailFrequency({ ...emailFrequency, applyWeekend: e.target.checked })}
                         />
                         <span>Appliquer le <span style={{ color: "#dc3545" }}>week-end</span> aussi</span>
                       </label>
                     </div>
                   </div>

                   <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                     <button
                       onClick={() => {
                         setEmailFrequency({
                           frequency: "immediate",
                           groupInterval: 30,
                           dailyTime: "09:00",
                           silenceFrom: "18:00",
                           silenceTo: "09:00",
                           applyWeekend: true
                         });
                       }}
                       style={{
                         padding: "10px 20px",
                         backgroundColor: "#6c757d",
                         color: "white",
                         border: "none",
                         borderRadius: "4px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       Annuler
                     </button>
                     <button
                       onClick={() => {
                         localStorage.setItem("emailFrequency", JSON.stringify(emailFrequency));
                         alert("Paramètres de fréquence enregistrés avec succès !");
                       }}
                       style={{
                         padding: "10px 20px",
                         backgroundColor: "#28a745",
                         color: "white",
                         border: "none",
                         borderRadius: "4px",
                         cursor: "pointer",
                         fontSize: "14px"
                       }}
                     >
                       Enregistrer
                     </button>
                   </div>
                 </div>
               )}

               {/* Section Test de Configuration */}
               {emailSubSection === "test" && (
                 <div>
                   <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                     2.6 Test de Configuration Email
                   </h2>
                   <div style={{ border: "2px dashed #007bff", borderRadius: "8px", padding: "24px", background: "white" }}>
                     <div style={{ background: "#dc3545", color: "white", padding: "12px", borderRadius: "4px", marginBottom: "24px", textAlign: "center", fontWeight: "600" }}>
                       TESTER LA CONFIGURATION EMAIL
                     </div>

                     <div style={{ marginBottom: "24px" }}>
                       <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: "600", color: "#333" }}>
                         Envoyer un Email de Test
                       </h3>
                       
                       <div style={{ marginBottom: "16px" }}>
                         <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                           Adresse Email de Test <span style={{ color: "#dc3545" }}>*</span>
                         </label>
                         <input
                           type="email"
                           value={testEmail.address}
                           onChange={(e) => setTestEmail({ ...testEmail, address: e.target.value })}
                           placeholder="admin@entreprise.com"
                           style={{
                             width: "100%",
                             padding: "10px",
                             borderRadius: "4px",
                             border: "1px solid #ddd",
                             fontSize: "14px"
                           }}
                         />
                       </div>

                       <div style={{ marginBottom: "16px" }}>
                         <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
                           Template à Tester <span style={{ color: "#dc3545" }}>*</span>
                         </label>
                         <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                           <select
                             value={testEmail.template}
                             onChange={(e) => setTestEmail({ ...testEmail, template: e.target.value })}
                             style={{
                               width: "100%",
                               padding: "10px 32px 10px 12px",
                               borderRadius: "4px",
                               border: "1px solid #ddd",
                               fontSize: "14px",
                               appearance: "none"
                             }}
                           >
                             <option value="">Sélectionner un template</option>
                             {emailTemplates.map((t) => (
                               <option key={t.id} value={t.name}>{t.name}</option>
                             ))}
                           </select>
                           <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>▼</span>
                         </div>
                       </div>

                       <button
                         onClick={() => {
                           if (!testEmail.address || !testEmail.template) {
                             alert("Veuillez remplir tous les champs requis");
                             return;
                           }
                           setTestResult({
                             success: true,
                             message: `Email envoyé avec succès à ${testEmail.address}`
                           });
                         }}
                         style={{
                           padding: "10px 20px",
                           backgroundColor: "#007bff",
                           color: "white",
                           border: "none",
                           borderRadius: "4px",
                           cursor: "pointer",
                           fontSize: "14px"
                         }}
                       >
                         Envoyer Email de Test
                       </button>
                     </div>

                     {testResult && (
                       <div style={{ marginTop: "24px", padding: "16px", background: testResult.success ? "#d4edda" : "#f8d7da", borderRadius: "4px", border: `1px solid ${testResult.success ? "#c3e6cb" : "#f5c6cb"}` }}>
                         <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px" }}>Résultat :</div>
                         {testResult.success ? (
                           <>
                             <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#155724", marginBottom: "8px" }}>
                               <span style={{ fontSize: "18px" }}>✓</span>
                               <span>{testResult.message}</span>
                             </div>
                             <div style={{ fontSize: "12px", color: "#155724" }}>
                               Vérifiez votre boîte de réception (y compris les spams)
                             </div>
                           </>
                         ) : (
                           <div style={{ color: "#721c24" }}>{testResult.message}</div>
                         )}
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {/* Section Logs d'Envoi */}
               {emailSubSection === "logs" && (
                 <div>
                   <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                     Logs d'Envoi
                   </h2>
                   <div style={{ border: "2px solid #007bff", borderRadius: "8px", padding: "24px", background: "white" }}>
                     <table style={{ width: "100%", borderCollapse: "collapse" }}>
                       <thead>
                         <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #007bff" }}>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#dc3545", borderRight: "1px solid #ddd" }}>Date/Heure</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#dc3545", borderRight: "1px solid #ddd" }}>Email Destinataire</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#dc3545", borderRight: "1px solid #ddd" }}>Template</th>
                           <th style={{ padding: "12px", textAlign: "left", fontSize: "14px", fontWeight: "600", color: "#dc3545" }}>Statut</th>
                         </tr>
                       </thead>
                       <tbody>
                         {emailLogs.map((log) => (
                           <tr key={log.id} style={{ borderBottom: "1px solid #ddd" }}>
                             <td style={{ padding: "12px", color: "#007bff" }}>{log.date}</td>
                             <td style={{ padding: "12px", color: "#007bff" }}>{log.recipient}</td>
                             <td style={{ padding: "12px", color: "#dc3545" }}>{log.template}</td>
                             <td style={{ padding: "12px" }}>
                               {log.status === "success" ? (
                                 <span style={{ color: "#28a745" }}>✔ OK</span>
                               ) : (
                                 <span style={{ color: "#dc3545" }}>❌ Erreur</span>
                               )}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>

                     {emailLogs.some(log => log.status === "error") && (
                       <div style={{ marginTop: "24px", padding: "16px", background: "#f8d7da", borderRadius: "4px", border: "1px solid #f5c6cb" }}>
                         <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px", color: "#721c24" }}>
                           Détails de l'Erreur :
                         </div>
                         <div style={{ fontSize: "14px", color: "#721c24" }}>
                           {emailLogs.find(log => log.status === "error")?.error}
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
               )}
             </div>
           )}

           {activeSection === "securite" && (
             <div style={{ padding: "24px" }}>
               <h1 style={{ marginBottom: "32px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                 Sécurité
               </h1>

               {/* Section Authentification */}
               <div style={{ 
                 marginBottom: "32px", 
                 border: "1px solid #ddd", 
                 borderRadius: "8px", 
                 padding: "24px",
                 background: "white"
               }}>
                 <h3 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                   Authentification
                 </h3>
                 <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.mfaRequired}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, mfaRequired: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Authentification Multi-Facteurs (MFA) obligatoire</span>
                   </label>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                     <span style={{ color: "#333", fontSize: "14px" }}>Expiration de session après</span>
                     <input
                       type="number"
                       min="1"
                       value={securitySettings.sessionTimeout}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, sessionTimeout: parseInt(e.target.value) || 30 })}
                       style={{
                         width: "80px",
                         padding: "8px 12px",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         fontSize: "14px",
                         textAlign: "center"
                       }}
                     />
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500" }}>{securitySettings.sessionTimeout}</span>
                     <span style={{ color: "#333", fontSize: "14px" }}>minutes d'inactivité</span>
                   </div>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.connectionHistory}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, connectionHistory: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Historique des connexions</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.suspiciousConnectionAlerts}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, suspiciousConnectionAlerts: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Alertes de connexion suspecte</span>
                   </label>
                 </div>
               </div>

               {/* Section Mot de Passe */}
               <div style={{ 
                 marginBottom: "32px", 
                 border: "1px solid #ddd", 
                 borderRadius: "8px", 
                 padding: "24px",
                 background: "white"
               }}>
                 <h3 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                   Mot de Passe
                 </h3>
                 <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500", minWidth: "180px" }}>Longueur minimale :</span>
                     <input
                       type="number"
                       min="1"
                       value={securitySettings.minPasswordLength}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, minPasswordLength: parseInt(e.target.value) || 8 })}
                       style={{
                         width: "80px",
                         padding: "8px 12px",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         fontSize: "14px",
                         textAlign: "center"
                       }}
                     />
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500" }}>{securitySettings.minPasswordLength}</span>
                     <span style={{ color: "#333", fontSize: "14px" }}>caractères</span>
                   </div>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.requireUppercase}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, requireUppercase: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Exiger des majuscules</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.requireLowercase}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, requireLowercase: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Exiger des minuscules</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.requireNumbers}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, requireNumbers: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Exiger des chiffres</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.requireSpecialChars}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, requireSpecialChars: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Exiger des caractères spéciaux</span>
                   </label>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500", minWidth: "180px" }}>Expiration du mot de passe :</span>
                     <input
                       type="number"
                       min="1"
                       value={securitySettings.passwordExpiration}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, passwordExpiration: parseInt(e.target.value) || 90 })}
                       style={{
                         width: "80px",
                         padding: "8px 12px",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         fontSize: "14px",
                         textAlign: "center"
                       }}
                     />
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500" }}>{securitySettings.passwordExpiration}</span>
                     <span style={{ color: "#333", fontSize: "14px" }}>jours</span>
                   </div>
                 </div>
               </div>

               {/* Section Audit et Logging */}
               <div style={{ 
                 marginBottom: "32px", 
                 border: "1px solid #ddd", 
                 borderRadius: "8px", 
                 padding: "24px",
                 background: "white"
               }}>
                 <h3 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                   Audit et Logging
                 </h3>
                 <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.recordAllActions}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, recordAllActions: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Enregistrer toutes les actions</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.recordSensitiveDataChanges}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, recordSensitiveDataChanges: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Enregistrer les modifications de données sensibles</span>
                   </label>
                   <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                     <input
                       type="checkbox"
                       checked={securitySettings.recordFailedLogins}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, recordFailedLogins: e.target.checked })}
                       style={{ width: "18px", height: "18px", cursor: "pointer" }}
                     />
                     <span style={{ color: "#333", fontSize: "14px" }}>Enregistrer les tentatives de connexion échouées</span>
                   </label>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500", minWidth: "200px" }}>Conserver les logs pendant :</span>
                     <input
                       type="number"
                       min="1"
                       value={securitySettings.keepLogsFor}
                       onChange={(e) => setSecuritySettings({ ...securitySettings, keepLogsFor: parseInt(e.target.value) || 90 })}
                       style={{
                         width: "80px",
                         padding: "8px 12px",
                         border: "1px solid #ddd",
                         borderRadius: "4px",
                         fontSize: "14px",
                         textAlign: "center"
                       }}
                     />
                     <span style={{ color: "#007bff", fontSize: "14px", fontWeight: "500" }}>{securitySettings.keepLogsFor}</span>
                     <span style={{ color: "#333", fontSize: "14px" }}>jours</span>
                   </div>
                 </div>
               </div>

               {/* Boutons d'action */}
               <div style={{ 
                 display: "flex", 
                 justifyContent: "flex-end", 
                 gap: "12px",
                 marginTop: "32px",
                 paddingTop: "24px",
                 borderTop: "1px solid #eee"
               }}>
                 <button
                   onClick={handleCancelSecurity}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "#6c757d",
                     color: "white",
                     border: "none",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px"
                   }}
                 >
                   [Annuler]
                 </button>
                 <button
                   onClick={handleSaveSecurity}
                   style={{
                     padding: "10px 20px",
                     backgroundColor: "#28a745",
                     color: "white",
                     border: "none",
                     borderRadius: "4px",
                     cursor: "pointer",
                     fontSize: "14px"
                   }}
                 >
                   [Enregistrer]
                 </button>
              </div>
            </div>
          )}

          {activeSection === "departements" && (
            <div style={{ padding: "24px" }}>
              <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                Départements
              </h1>
              <p style={{ color: "#666", marginBottom: "24px" }}>
                Gestion des départements de l'organisation
              </p>
              <div style={{ 
                background: "white", 
                borderRadius: "8px", 
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                padding: "24px"
              }}>
                <p style={{ color: "#999", fontSize: "14px", textAlign: "center", padding: "40px" }}>
                  Section en cours de développement
                </p>
              </div>
            </div>
          )}

          {activeSection === "audit-logs" && (
            <div style={{ padding: "24px" }}>
              <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>
                Audit et Logs
              </h1>
              <p style={{ color: "#666", marginBottom: "24px" }}>
                Consultation et analyse des logs système et des activités d'audit
              </p>
              <div style={{ 
                background: "white", 
                borderRadius: "8px", 
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                padding: "24px"
              }}>
                <p style={{ color: "#999", fontSize: "14px", textAlign: "center", padding: "40px" }}>
                  Section en cours de développement
                </p>
              </div>
            </div>
          )}

            {/* Section Notifications dans le contenu principal */}
            {activeSection === "notifications" && (
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
                        navigate("/dashboard/dsi");
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
      </div>

       {/* Modal Ajouter un utilisateur */}
       {showAddUserModal && (
         <div 
           onClick={() => setShowAddUserModal(false)}
           style={{
             position: "fixed",
             top: 0,
             left: 0,
             right: 0,
             bottom: 0,
             background: "rgba(0,0,0,0.5)",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             zIndex: 1000,
             padding: "20px"
           }}
         >
           <div 
             onClick={(e) => e.stopPropagation()}
             style={{
               background: "white",
               borderRadius: "12px",
               width: "100%",
               maxWidth: "600px",
               maxHeight: "90vh",
               overflowY: "auto",
               boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
               padding: "24px"
             }}
           >
             <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
               <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "600", color: "#333" }}>Ajouter un utilisateur</h2>
               <button
                 onClick={() => setShowAddUserModal(false)}
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

             <form onSubmit={(e) => {
               e.preventDefault();
               // TODO: Implémenter la création de l'utilisateur
               alert("Création de l'utilisateur (à implémenter)");
               setShowAddUserModal(false);
             }}>
               {/* Informations Personnelles */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Personnelles</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Nom Complet <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="text"
                       required
                       value={newUser.full_name}
                       onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="Nom complet"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Email <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="email"
                       required
                       value={newUser.email}
                       onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="email@example.com"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Numéro de Téléphone
                     </label>
                     <input
                       type="tel"
                       value={newUser.phone}
                       onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="Numéro de téléphone"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Département <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <select
                       required
                       value={newUser.agency}
                       onChange={(e) => setNewUser({ ...newUser, agency: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                     >
                       <option value="">Sélectionner un département</option>
                       {Array.from(new Set(allUsers.map((u: any) => u.agency).filter(Boolean))).map((agency) => (
                         <option key={agency} value={agency}>{agency}</option>
                       ))}
                       <option value="Marketing">Marketing</option>
                       <option value="IT">IT</option>
                       <option value="Ressources Humaines">Ressources Humaines</option>
                       <option value="Finance">Finance</option>
                       <option value="Ventes">Ventes</option>
                     </select>
                   </div>
                 </div>
               </div>

               {/* Rôle et Permissions */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Rôle et Permissions</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #007bff" }}>
                   <div style={{ marginBottom: "20px" }}>
                     <label style={{ display: "block", marginBottom: "12px", color: "#333", fontWeight: "500" }}>
                       Rôle <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                       {["Utilisateur", "Technicien (Matériel)", "Technicien (Applicatif)", "Secrétaire DSI", "Adjoint DSI", "DSI", "Administrateur"].map((role) => (
                         <label key={role} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="role"
                             value={role}
                             checked={newUser.role === role}
                             onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                             required
                             style={{ cursor: "pointer" }}
                           />
                           <span>{role}</span>
                         </label>
                       ))}
                     </div>
                   </div>
                   <div style={{ borderTop: "1px solid #eee", paddingTop: "16px" }}>
                     <label style={{ display: "block", marginBottom: "12px", color: "#333", fontWeight: "500" }}>
                       Statut <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                       <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                         <input
                           type="checkbox"
                           checked={newUser.actif === true}
                           onChange={(e) => setNewUser({ ...newUser, actif: e.target.checked })}
                           style={{ cursor: "pointer" }}
                         />
                         <span>Actif</span>
                       </label>
                     </div>
                   </div>
                 </div>
               </div>

               {/* Informations Technicien (conditionnel) */}
               {(newUser.role === "Technicien (Matériel)" || newUser.role === "Technicien (Applicatif)") && (
                 <div style={{ marginBottom: "24px" }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Technicien</h3>
                   <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #17a2b8", background: "#f8f9fa" }}>
                   </div>
                 </div>
               )}

               {/* Mot de Passe */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Mot de Passe</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Mot de Passe <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="password"
                       required={!newUser.generateRandomPassword}
                       disabled={newUser.generateRandomPassword}
                       value={newUser.password}
                       onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px", backgroundColor: newUser.generateRandomPassword ? "#f5f5f5" : "white" }}
                       placeholder="Mot de passe"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Confirmer le Mot de Passe <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="password"
                       required={!newUser.generateRandomPassword}
                       disabled={newUser.generateRandomPassword}
                       value={newUser.confirmPassword}
                       onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px", backgroundColor: newUser.generateRandomPassword ? "#f5f5f5" : "white" }}
                       placeholder="Confirmer le mot de passe"
                     />
                   </div>
                   <div style={{ marginBottom: "12px" }}>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="checkbox"
                         checked={newUser.generateRandomPassword}
                         onChange={(e) => setNewUser({ ...newUser, generateRandomPassword: e.target.checked })}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Générer un mot de passe aléatoire</span>
                     </label>
                   </div>
                   <div>
                     <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                       <input
                         type="checkbox"
                         checked={newUser.sendEmail}
                         onChange={(e) => setNewUser({ ...newUser, sendEmail: e.target.checked })}
                         style={{ cursor: "pointer" }}
                       />
                       <span>Envoyer les identifiants par email</span>
                     </label>
                   </div>
                 </div>
               </div>

               {/* Boutons d'action */}
               <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                 <button
                   type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUser({
                      full_name: "",
                      email: "",
                      phone: "",
                      agency: "",
                      role: "",
                      actif: true,
                      password: "",
                      confirmPassword: "",
                      generateRandomPassword: true,
                      sendEmail: true,
                    });
                  }}
                   style={{ 
                     padding: "10px 20px", 
                     backgroundColor: "#6c757d", 
                     color: "white", 
                     border: "none", 
                     borderRadius: "4px", 
                     cursor: "pointer", 
                     fontSize: "14px"
                   }}
                 >
                   [Annuler]
                 </button>
                 <button
                   type="submit"
                   style={{ 
                     padding: "10px 20px", 
                     backgroundColor: "#28a745", 
                     color: "white", 
                     border: "none", 
                     borderRadius: "4px", 
                     cursor: "pointer", 
                     fontSize: "14px"
                   }}
                 >
                   [Créer Utilisateur]
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}

       {/* Modal Modifier un utilisateur */}
       {showEditUserModal && editingUser && (
         <div 
           onClick={() => {
             setShowEditUserModal(false);
             setEditingUser(null);
           }}
           style={{
             position: "fixed",
             top: 0,
             left: 0,
             right: 0,
             bottom: 0,
             background: "rgba(0,0,0,0.5)",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             zIndex: 1000,
             padding: "20px"
           }}
         >
           <div 
             onClick={(e) => e.stopPropagation()}
             style={{
               background: "white",
               borderRadius: "12px",
               width: "100%",
               maxWidth: "600px",
               maxHeight: "90vh",
               overflowY: "auto",
               boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
               padding: "24px"
             }}
           >
             <div style={{ marginBottom: "24px" }}>
               <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "600", color: "#333", marginBottom: "8px" }}>
                 MODIFIER L'UTILISATEUR
               </h2>
               <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>
                 {editingUser.full_name || editingUser.name} (ID: {editingUser.id || editingUser.user_id})
               </p>
             </div>

             <div style={{ borderTop: "1px solid #ddd", marginBottom: "24px" }}></div>

             <form onSubmit={handleUpdateUser}>
               {/* Informations Personnelles */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Personnelles</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Nom Complet <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="text"
                       required
                       value={editUser.full_name}
                       onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="Nom complet"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Email <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <input
                       type="email"
                       required
                       value={editUser.email}
                       onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="email@example.com"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Numéro de Téléphone
                     </label>
                     <input
                       type="tel"
                       value={editUser.phone || ""}
                       onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       placeholder="Numéro de téléphone"
                     />
                   </div>
                   <div style={{ marginBottom: "16px" }}>
                     <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                       Département <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <select
                       required
                       value={editUser.agency}
                       onChange={(e) => setEditUser({ ...editUser, agency: e.target.value })}
                       style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                     >
                       <option value="">Sélectionner un département</option>
                       {Array.from(new Set(allUsers.map((u: any) => u.agency).filter(Boolean))).map((agency) => (
                         <option key={agency} value={agency}>{agency}</option>
                       ))}
                       <option value="Marketing">Marketing</option>
                       <option value="IT">IT</option>
                       <option value="Ressources Humaines">Ressources Humaines</option>
                       <option value="Finance">Finance</option>
                       <option value="Ventes">Ventes</option>
                     </select>
                   </div>
                 </div>
               </div>

               {/* Rôle et Permissions */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Rôle et Permissions</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #007bff" }}>
                   <div style={{ marginBottom: "20px" }}>
                     <label style={{ display: "block", marginBottom: "12px", color: "#333", fontWeight: "500" }}>
                       Rôle <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                       {["Utilisateur", "Technicien (Matériel)", "Technicien (Applicatif)", "Secrétaire DSI", "Adjoint DSI", "DSI", "Administrateur"].map((role) => (
                         <label key={role} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="editRole"
                             value={role}
                             checked={editUser.role === role}
                             onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                             required
                             style={{ cursor: "pointer" }}
                           />
                           <span>{role}{editUser.role === role ? " (Sélectionné)" : ""}</span>
                         </label>
                       ))}
                     </div>
                   </div>
                   <div style={{ borderTop: "1px solid #eee", paddingTop: "16px" }}>
                     <label style={{ display: "block", marginBottom: "12px", color: "#333", fontWeight: "500" }}>
                       Statut <span style={{ color: "#dc3545" }}>*</span>
                     </label>
                     <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                       <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                         <input
                           type="checkbox"
                           checked={editUser.actif === true}
                           onChange={(e) => setEditUser({ ...editUser, actif: e.target.checked })}
                           style={{ cursor: "pointer" }}
                         />
                         <span>Actif</span>
                       </label>
                     </div>
                   </div>
                 </div>
               </div>

               {/* Informations Technicien (conditionnel) */}
               {(editUser.role === "Technicien (Matériel)" || editUser.role === "Technicien (Applicatif)") && (
                 <div style={{ marginBottom: "24px" }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Technicien</h3>
                   <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #17a2b8", background: "#f8f9fa" }}>
                   </div>
                 </div>
               )}

               {/* Historique */}
               <div style={{ marginBottom: "24px" }}>
                 <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Historique</h3>
                 <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
                   <div style={{ marginBottom: "8px", paddingLeft: "8px", borderLeft: "2px solid #007bff" }}>
                     <div style={{ fontSize: "14px", color: "#333" }}>
                       Créé le : {editingUser.created_at ? new Date(editingUser.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " à " + new Date(editingUser.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                     </div>
                   </div>
                   <div style={{ marginBottom: "8px", paddingLeft: "8px", borderLeft: "2px solid #007bff" }}>
                     <div style={{ fontSize: "14px", color: "#333" }}>
                       Modifié le : {editingUser.updated_at ? new Date(editingUser.updated_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " à " + new Date(editingUser.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                     </div>
                   </div>
                   <div style={{ paddingLeft: "8px", borderLeft: "2px solid #007bff" }}>
                     <div style={{ fontSize: "14px", color: "#333" }}>
                       Dernière connexion : {editingUser.last_login ? new Date(editingUser.last_login).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " à " + new Date(editingUser.last_login).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "N/A"}
                     </div>
                   </div>
                 </div>
               </div>

               {/* Boutons d'action */}
               <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                 <button
                   type="button"
                   onClick={() => {
                     setShowEditUserModal(false);
                     setEditingUser(null);
                   }}
                   style={{ 
                     padding: "10px 20px", 
                     backgroundColor: "#6c757d", 
                     color: "white", 
                     border: "none", 
                     borderRadius: "4px", 
                     cursor: "pointer", 
                     fontSize: "14px"
                   }}
                 >
                   [Annuler]
                 </button>
                 <button
                   type="submit"
                   style={{ 
                     padding: "10px 20px", 
                     backgroundColor: "#28a745", 
                     color: "white", 
                     border: "none", 
                     borderRadius: "4px", 
                     cursor: "pointer", 
                     fontSize: "14px"
                   }}
                 >
                   [Enregistrer Modifications]
                 </button>
               </div>
             </form>
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

      {/* Modal de réouverture avec motif de rejet */}
      {/* Modal de réassignation */}
      {showReassignModal && reassignTicketId && (
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
            maxWidth: "600px",
            width: "90%",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <h3 style={{ marginBottom: "16px", color: "#17a2b8" }}>Réassigner le ticket</h3>
            
            {/* Informations du ticket */}
            {(() => {
              const ticket = allTickets.find(t => t.id === reassignTicketId);
              return ticket ? (
                <div style={{ marginBottom: "20px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Ticket {formatTicketNumber(ticket.number)}:</strong> {ticket.title}
                  </div>
                  {ticket.technician && (
                    <div style={{ fontSize: "14px", color: "#666" }}>
                      Actuellement assigné à: <strong>{ticket.technician.full_name}</strong>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Sélection du technicien */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Sélectionner un technicien <span style={{ color: "#dc3545" }}>*</span>
              </label>
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "8px", 
                  border: "1px solid #ddd", 
                  borderRadius: "4px",
                  fontSize: "14px"
                }}
              >
                <option value="">Sélectionner un technicien</option>
                {(() => {
                  const ticket = allTickets.find(t => t.id === reassignTicketId);
                  const filteredTechs = ticket ? getFilteredTechnicians(ticket.type) : technicians;
                  return filteredTechs.map((tech) => {
                    const workload = allTickets.filter((tk) => 
                      tk.technician_id === tech.id && 
                      (tk.status === "assigne_technicien" || tk.status === "en_cours")
                    ).length;
                    const specialization = tech.specialization ? ` (${tech.specialization})` : "";
                    return (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}{specialization} - {workload} ticket(s)
                      </option>
                    );
                  });
                })()}
              </select>
            </div>

            {/* Notes optionnelles */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Notes/Instructions pour le technicien (optionnel)
              </label>
              <textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Exemple: Ce ticket nécessite une attention particulière..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Boutons */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowReassignModal(false);
                  setReassignTicketId(null);
                  setSelectedTechnician("");
                  setAssignmentNotes("");
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => reassignTicketId && handleReassign(reassignTicketId)}
                disabled={loading || !selectedTechnician}
                style={{
                  padding: "10px 20px",
                  background: "#17a2b8",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading || !selectedTechnician ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  opacity: loading || !selectedTechnician ? 0.6 : 1
                }}
              >
                {loading ? "Réassignation..." : "Confirmer la réassignation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'assignation */}
      {showAssignModal && assignTicketId && (
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
            maxWidth: "600px",
            width: "90%",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <h3 style={{ marginBottom: "16px", color: "#f97316" }}>Assigner le ticket</h3>
            
            {/* Informations du ticket */}
            {(() => {
              const ticket = allTickets.find(t => t.id === assignTicketId);
              return ticket ? (
                <div style={{ marginBottom: "20px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Ticket {formatTicketNumber(ticket.number)}:</strong> {ticket.title}
                  </div>
                  <div style={{ fontSize: "14px", color: "#666" }}>
                    Type: <strong>{ticket.type === "materiel" ? "Matériel" : "Applicatif"}</strong>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Sélection du technicien */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Sélectionner un technicien <span style={{ color: "#dc3545" }}>*</span>
              </label>
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "8px", 
                  border: "1px solid #ddd", 
                  borderRadius: "4px",
                  fontSize: "14px"
                }}
              >
                <option value="">Sélectionner un technicien</option>
                {(() => {
                  const ticket = allTickets.find(t => t.id === assignTicketId);
                  const filteredTechs = ticket ? getFilteredTechnicians(ticket.type) : technicians;
                  return filteredTechs.map((tech) => {
                    const workload = allTickets.filter((tk) => 
                      tk.technician_id === tech.id && 
                      (tk.status === "assigne_technicien" || tk.status === "en_cours")
                    ).length;
                    const specialization = tech.specialization ? ` (${tech.specialization})` : "";
                    return (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}{specialization} - {workload} ticket(s)
                      </option>
                    );
                  });
                })()}
              </select>
            </div>

            {/* Notes optionnelles */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Notes/Instructions pour le technicien (optionnel)
              </label>
              <textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Exemple: Ce ticket nécessite une attention particulière..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Boutons */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setAssignTicketId(null);
                  setSelectedTechnician("");
                  setAssignmentNotes("");
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  background: "white",
                  color: "black",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => assignTicketId && handleAssign(assignTicketId)}
                disabled={loading || !selectedTechnician}
                style={{
                  padding: "10px 20px",
                  background: "#f97316",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading || !selectedTechnician ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  opacity: loading || !selectedTechnician ? 0.6 : 1
                }}
              >
                {loading ? "Assignation..." : "Confirmer l'assignation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelegateModal && delegateTicketId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", padding: "24px", borderRadius: "8px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginBottom: "16px", color: "#f97316" }}>Déléguer à un adjoint DSI</h3>
            {(() => {
              const ticket = allTickets.find(t => t.id === delegateTicketId);
              return ticket ? (
                <div style={{ marginBottom: "20px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Ticket {formatTicketNumber(ticket.number)}:</strong> {ticket.title}
                  </div>
                  <div style={{ fontSize: "14px", color: "#666" }}>
                    Type: <strong>{ticket.type === "materiel" ? "Matériel" : "Applicatif"}</strong>
                  </div>
                </div>
              ) : null;
            })()}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Sélectionner un adjoint DSI <span style={{ color: "#dc3545" }}>*</span>
              </label>
              <select
                value={selectedAdjoint}
                onChange={(e) => setSelectedAdjoint(e.target.value)}
                style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
              >
                <option value="">Sélectionner un adjoint DSI</option>
                {allUsers.filter((u: any) => u.role?.name === "Adjoint DSI").map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} {u.agency ? `- ${u.agency}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Notes pour l’adjoint (optionnel)
              </label>
              <textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Instructions ou contexte pour l’adjoint..."
                rows={3}
                style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowDelegateModal(false);
                  setDelegateTicketId(null);
                  setSelectedAdjoint("");
                  setAssignmentNotes("");
                }}
                disabled={loading}
                style={{ padding: "10px 20px", background: "white", color: "black", border: "1px solid #ddd", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "500" }}
              >
                Annuler
              </button>
              <button
                onClick={() => delegateTicketId && handleDelegate(delegateTicketId)}
                disabled={loading || !selectedAdjoint}
                style={{ padding: "10px 20px", background: "#f97316", color: "white", border: "none", borderRadius: "4px", cursor: loading || !selectedAdjoint ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "500", opacity: loading || !selectedAdjoint ? 0.6 : 1 }}
              >
                {loading ? "Délégation..." : "Confirmer la délégation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReopenModal && reopenTicketId && (
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
            maxWidth: "600px",
            width: "90%",
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <h3 style={{ marginBottom: "16px", color: "#dc3545" }}>Réouvrir le ticket</h3>
            
            {/* Affichage du motif de rejet */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", color: "#333" }}>
                Motif de rejet par l'utilisateur :
              </label>
              <div style={{
                padding: "12px",
                background: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: "4px",
                color: "#856404",
                fontSize: "14px",
                lineHeight: "1.5",
                minHeight: "60px",
                whiteSpace: "pre-wrap"
              }}>
                {loadingRejectionReason ? (
                  <div style={{ color: "#856404", fontStyle: "italic" }}>Chargement du motif...</div>
                ) : rejectionReason ? (
                  rejectionReason
                ) : (
                  "Aucun motif disponible"
                )}
              </div>
            </div>

            {/* Sélection du technicien */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Sélectionner un technicien <span style={{ color: "#dc3545" }}>*</span>
              </label>
              <select
                value={selectedTechnician}
                onChange={(e) => setSelectedTechnician(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "8px", 
                  border: "1px solid #ddd", 
                  borderRadius: "4px",
                  fontSize: "14px"
                }}
              >
                <option value="">Sélectionner un technicien</option>
                {(() => {
                  const ticket = allTickets.find(t => t.id === reopenTicketId);
                  const filteredTechs = ticket ? getFilteredTechnicians(ticket.type) : technicians;
                  return filteredTechs.map((tech) => {
                    const workload = allTickets.filter((tk) => 
                      tk.technician_id === tech.id && 
                      (tk.status === "assigne_technicien" || tk.status === "en_cours")
                    ).length;
                    const specialization = tech.specialization ? ` (${tech.specialization})` : "";
                    return (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}{specialization} - {workload} ticket(s)
                      </option>
                    );
                  });
                })()}
              </select>
            </div>

            {/* Notes optionnelles */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                Notes/Instructions pour le technicien (optionnel)
              </label>
              <textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Exemple: Prendre en compte le motif de rejet ci-dessus..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Boutons d'action */}
            <div style={{ display: "flex", gap: "8px", marginTop: "20px" }}>
              <button
                onClick={() => reopenTicketId && handleReopen(reopenTicketId)}
                disabled={loading || !selectedTechnician}
                style={{ 
                  flex: 1, 
                  padding: "10px", 
                  backgroundColor: selectedTechnician ? "#17a2b8" : "#ccc", 
                  color: "white", 
                  border: "none", 
                  borderRadius: "4px", 
                  cursor: selectedTechnician ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >
                {loading ? "Réouverture..." : "Confirmer la réouverture"}
              </button>
              <button
                onClick={() => {
                  setShowReopenModal(false);
                  setReopenTicketId(null);
                  setRejectionReason("");
                  setSelectedTechnician("");
                  setAssignmentNotes("");
                }}
                disabled={loading}
                style={{ 
                  flex: 1, 
                  padding: "10px", 
                  background: "#f5f5f5", 
                  border: "1px solid #ddd", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >
                Annuler
              </button>
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
                                Authorization: `Bearer ${token}`,
                              },
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setSelectedNotificationTicketDetails(data);
                              // Charger l'historique
                              try {
                                const historyRes = await fetch(`http://localhost:8000/tickets/${ticket.id}/history`, {
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                  },
                                });
                                if (historyRes.ok) {
                                  const historyData = await historyRes.json();
                                  setSelectedNotificationTicketHistory(Array.isArray(historyData) ? historyData : []);
                                }
                              } catch (err) {
                                console.error("Erreur chargement historique:", err);
                              }
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
                              Ticket {formatTicketNumber(ticket.number)}
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

                    <div style={{ marginBottom: "16px" }}>
                      <strong>Description :</strong>
                      <p style={{ marginTop: "4px", padding: "8px", background: "#f8f9fa", borderRadius: "4px", whiteSpace: "pre-wrap" }}>
                        {selectedNotificationTicketDetails.description || ""}
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
                          background: selectedNotificationTicketDetails.priority === "critique" ? "#f44336" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : "white"
                        }}>
                          {getPriorityLabel(selectedNotificationTicketDetails.priority)}
                        </span>
                      </div>
                      {selectedNotificationTicketDetails.category && (
                        <div>
                          <strong>Catégorie :</strong>
                          <span style={{ marginLeft: "8px", padding: "4px 8px", background: "#f3e5f5", borderRadius: "4px" }}>
                            {selectedNotificationTicketDetails.category || "Non spécifiée"}
                          </span>
                        </div>
                      )}
                      {selectedNotificationTicketDetails.creator && (
                        <div>
                          <strong>Créateur :</strong>
                          <span style={{ marginLeft: "8px" }}>
                            {selectedNotificationTicketDetails.creator.full_name}
                          </span>
                        </div>
                      )}
                      {selectedNotificationTicketDetails.technician && (
                        <div>
                          <strong>Technicien assigné :</strong>
                          <span style={{ marginLeft: "8px" }}>
                            {selectedNotificationTicketDetails.technician.full_name}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: "24px", marginBottom: "16px" }}>
                      <strong>Historique :</strong>
                      <div style={{ marginTop: "8px" }}>
                        {selectedNotificationTicketHistory.length === 0 ? (
                          <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>
                        ) : (
                          selectedNotificationTicketHistory.map((h) => (
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

      {/* Menu d'actions pour la section Dashboard (rendu au niveau racine pour éviter les problèmes d'overflow) */}
      {activeSection === "dashboard" && openActionsMenuFor !== null && actionsMenuPosition !== null && (() => {
        const ticket = allTickets.find(t => t.id === openActionsMenuFor);
        if (!ticket) return null;
        
        return (
          <div
            data-menu-id={ticket.id}
            style={{
              position: "fixed",
              top: actionsMenuPosition?.top || 0,
              left: actionsMenuPosition?.left || 0,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
              minWidth: 180,
              zIndex: 9999,
              maxHeight: 280,
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {ticket.status === "en_attente_analyse" && (
              <>
                <button
                  onClick={() => { loadTicketDetails(ticket.id); setOpenActionsMenuFor(null); }}
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
                  onClick={() => { handleAssignClick(ticket.id); setOpenActionsMenuFor(null); }}
                  disabled={loading}
                  style={{ 
                    width: "100%", 
                    padding: "10px 12px", 
                    background: "transparent", 
                    border: "none", 
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "left", 
                    cursor: loading ? "not-allowed" : "pointer",
                    color: "#111827",
                    fontSize: "14px",
                    display: "block",
                    whiteSpace: "nowrap",
                    opacity: loading ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Assigner
                </button>
                {userRole === "DSI" && (
                  <button
                    onClick={() => { handleDelegateClick(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Déléguer à un adjoint
                  </button>
                )}
                {canEscalate() && (
                  <button
                    onClick={() => { handleEscalate(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Escalader
                  </button>
                )}
              </>
            )}
            {(ticket.status === "assigne_technicien" || ticket.status === "en_cours") && (
              <>
                <button
                  onClick={() => { loadTicketDetails(ticket.id); setOpenActionsMenuFor(null); }}
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
                  onClick={() => { handleReassignClick(ticket.id); setOpenActionsMenuFor(null); }}
                  disabled={loading}
                  style={{ 
                    width: "100%", 
                    padding: "10px 12px", 
                    background: "transparent", 
                    border: "none", 
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "left", 
                    cursor: loading ? "not-allowed" : "pointer",
                    color: "#111827",
                    fontSize: "14px",
                    display: "block",
                    whiteSpace: "nowrap",
                    opacity: loading ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Réassigner
                </button>
                {canEscalate() && (
                  <button
                    onClick={() => { handleEscalate(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Escalader
                  </button>
                )}
              </>
            )}
            {ticket.status === "resolu" && (
              <button
                onClick={() => { handleClose(ticket.id); setOpenActionsMenuFor(null); }}
                disabled={loading}
                style={{ 
                  width: "100%", 
                  padding: "10px 12px", 
                  background: "transparent", 
                  border: "none", 
                  textAlign: "left", 
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#111827",
                  fontSize: "14px",
                  display: "block",
                  whiteSpace: "nowrap",
                  opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Clôturer
              </button>
            )}
            {ticket.status === "rejete" && (
              <button
                onClick={() => { handleReopenClick(ticket.id); setOpenActionsMenuFor(null); }}
                disabled={loading}
                style={{ 
                  width: "100%", 
                  padding: "10px 12px", 
                  background: "transparent", 
                  border: "none", 
                  textAlign: "left", 
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#111827",
                  fontSize: "14px",
                  display: "block",
                  whiteSpace: "nowrap",
                  opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Rouvrir
              </button>
            )}
          </div>
        );
      })()}

      {/* Menu d'actions pour la section Tickets (rendu au niveau racine pour éviter les problèmes d'overflow) */}
      {activeSection === "tickets" && openActionsMenuFor !== null && actionsMenuPosition !== null && (() => {
        const ticket = allTickets.find(t => t.id === openActionsMenuFor);
        if (!ticket) return null;
        
        return (
          <div
            data-menu-id={ticket.id}
            style={{
              position: "fixed",
              top: actionsMenuPosition?.top || 0,
              left: actionsMenuPosition?.left || 0,
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
              minWidth: 180,
              zIndex: 9999,
              maxHeight: 280,
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {ticket.status === "en_attente_analyse" && (
              <>
                <button
                  onClick={() => { loadTicketDetails(ticket.id); setOpenActionsMenuFor(null); }}
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
                  onClick={() => { handleAssignClick(ticket.id); setOpenActionsMenuFor(null); }}
                  disabled={loading}
                  style={{ 
                    width: "100%", 
                    padding: "10px 12px", 
                    background: "transparent", 
                    border: "none", 
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "left", 
                    cursor: loading ? "not-allowed" : "pointer",
                    color: "#111827",
                    fontSize: "14px",
                    display: "block",
                    whiteSpace: "nowrap",
                    opacity: loading ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Assigner
                </button>
                {userRole === "DSI" && (
                  <button
                    onClick={() => { handleDelegateClick(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Déléguer à un adjoint
                  </button>
                )}
                {canEscalate() && (
                  <button
                    onClick={() => { handleEscalate(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Escalader
                  </button>
                )}
              </>
            )}
            {(ticket.status === "assigne_technicien" || ticket.status === "en_cours") && (
              <>
                <button
                  onClick={() => { loadTicketDetails(ticket.id); setOpenActionsMenuFor(null); }}
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
                  onClick={() => { handleReassignClick(ticket.id); setOpenActionsMenuFor(null); }}
                  disabled={loading}
                  style={{ 
                    width: "100%", 
                    padding: "10px 12px", 
                    background: "transparent", 
                    border: "none", 
                    borderTop: "1px solid #e5e7eb",
                    textAlign: "left", 
                    cursor: loading ? "not-allowed" : "pointer",
                    color: "#111827",
                    fontSize: "14px",
                    display: "block",
                    whiteSpace: "nowrap",
                    opacity: loading ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Réassigner
                </button>
                {canEscalate() && (
                  <button
                    onClick={() => { handleEscalate(ticket.id); setOpenActionsMenuFor(null); }}
                    disabled={loading}
                    style={{ 
                      width: "100%", 
                      padding: "10px 12px", 
                      background: "transparent", 
                      border: "none", 
                      borderTop: "1px solid #e5e7eb",
                      textAlign: "left", 
                      cursor: loading ? "not-allowed" : "pointer",
                      color: "#111827",
                      fontSize: "14px",
                      display: "block",
                      whiteSpace: "nowrap",
                      opacity: loading ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Escalader
                  </button>
                )}
              </>
            )}
            {ticket.status === "resolu" && (
              <button
                onClick={() => { handleClose(ticket.id); setOpenActionsMenuFor(null); }}
                disabled={loading}
                style={{ 
                  width: "100%", 
                  padding: "10px 12px", 
                  background: "transparent", 
                  border: "none", 
                  textAlign: "left", 
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#111827",
                  fontSize: "14px",
                  display: "block",
                  whiteSpace: "nowrap",
                  opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Clôturer
              </button>
            )}
            {ticket.status === "rejete" && (
              <button
                onClick={() => { handleReopenClick(ticket.id); setOpenActionsMenuFor(null); }}
                disabled={loading}
                style={{ 
                  width: "100%", 
                  padding: "10px 12px", 
                  background: "transparent", 
                  border: "none", 
                  textAlign: "left", 
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#111827",
                  fontSize: "14px",
                  display: "block",
                  whiteSpace: "nowrap",
                  opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.backgroundColor = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Réouvrir
              </button>
            )}
          </div>
        );
      })()}
    </div>
    </div>
  );
}

export default DSIDashboard;
