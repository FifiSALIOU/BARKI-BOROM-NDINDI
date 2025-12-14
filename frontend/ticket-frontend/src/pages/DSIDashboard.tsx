import { useEffect, useState, useRef } from "react";
import React from "react";
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
  Cell
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
  technician_id: string | null;
  technician?: {
    full_name: string;
  };
  created_at?: string;
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
  status?: string;
  availability_status?: string;
  last_login_at?: string | null;
  success_rate?: number;
  workload_ratio?: string;
  work_hours?: string;
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
}

interface UserRead {
  full_name: string;
  email: string;
  agency?: string | null;
}

function DSIDashboard({ token }: DSIDashboardProps) {
  // Fonction pour déterminer le statut de disponibilité basé sur les horaires de travail
  function getAvailabilityStatus(tech: Technician): string {
    // Si pas d'horaires définis, utiliser le statut de la base de données
    if (!tech.work_hours || tech.work_hours.trim() === "") {
      return tech.availability_status || "disponible";
    }

    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute; // Convertir en minutes depuis minuit

    // Parser les horaires
    // Formats supportés: "08:30-12:30 / 14:00-17:30", "9h-18h", "09:00-18:00"
    const workHours = tech.work_hours.trim();
    
    // Normaliser le format (remplacer "h" par ":00")
    const normalized = workHours.replace(/(\d+)h/g, "$1:00");
    
    // Séparer les plages horaires
    const ranges = normalized.split("/").map(r => r.trim());
    
    let isInWorkTime = false;
    let isInBreakTime = false;
    
    // Si une seule plage (ex: "09:00-18:00")
    if (ranges.length === 1) {
      const range = ranges[0];
      const match = range.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (match) {
        const startHour = parseInt(match[1]);
        const startMin = parseInt(match[2]);
        const endHour = parseInt(match[3]);
        const endMin = parseInt(match[4]);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        isInWorkTime = currentTimeMinutes >= startTime && currentTimeMinutes <= endTime;
      }
    } 
    // Si deux plages (ex: "08:30-12:30 / 14:00-17:30")
    else if (ranges.length === 2) {
      const morningRange = ranges[0];
      const afternoonRange = ranges[1];
      
      // Parser la plage du matin
      const morningMatch = morningRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (morningMatch) {
        const startHour = parseInt(morningMatch[1]);
        const startMin = parseInt(morningMatch[2]);
        const endHour = parseInt(morningMatch[3]);
        const endMin = parseInt(morningMatch[4]);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        if (currentTimeMinutes >= startTime && currentTimeMinutes <= endTime) {
          isInWorkTime = true;
        }
      }
      
      // Parser la plage de l'après-midi
      const afternoonMatch = afternoonRange.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (afternoonMatch) {
        const startHour = parseInt(afternoonMatch[1]);
        const startMin = parseInt(afternoonMatch[2]);
        const endHour = parseInt(afternoonMatch[3]);
        const endMin = parseInt(afternoonMatch[4]);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        if (currentTimeMinutes >= startTime && currentTimeMinutes <= endTime) {
          isInWorkTime = true;
        }
      }
      
      // Déterminer si on est dans la pause (entre les deux plages)
      if (morningMatch && afternoonMatch) {
        const morningEndHour = parseInt(morningMatch[3]);
        const morningEndMin = parseInt(morningMatch[4]);
        const afternoonStartHour = parseInt(afternoonMatch[1]);
        const afternoonStartMin = parseInt(afternoonMatch[2]);
        const morningEndTime = morningEndHour * 60 + morningEndMin;
        const afternoonStartTime = afternoonStartHour * 60 + afternoonStartMin;
        
        if (currentTimeMinutes > morningEndTime && currentTimeMinutes < afternoonStartTime) {
          isInBreakTime = true;
        }
      }
    }
    
    // PRIORITÉ 1 : Si on est dans la pause horaire automatique, retourner "en pause"
    // (cela a la priorité la plus haute, même si le technicien s'est marqué "Disponible")
    if (isInBreakTime) {
      return "en pause";
    }
    
    // PRIORITÉ 2 : Si on est en dehors des heures de travail, forcer "indisponible"
    if (!isInWorkTime) {
      return "indisponible";
    }
    
    // PRIORITÉ 3 : Si on est dans les heures de travail, utiliser le statut manuel du technicien
    // (disponible, occupé, ou en pause selon ce qu'il a choisi)
    return tech.availability_status || "disponible";
  }

  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<Date>(new Date()); // Pour forcer le re-render selon l'heure
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  const [reopenTicketId, setReopenTicketId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [loadingRejectionReason, setLoadingRejectionReason] = useState<boolean>(false);
  const [viewTicketDetails, setViewTicketDetails] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [showReassignModal, setShowReassignModal] = useState<boolean>(false);
  const [reassignTicketId, setReassignTicketId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignTicketId, setAssignTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState({
    openTickets: 0,
    avgResolutionTime: "0 jours",
    userSatisfaction: "0%",
  });
  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showTicketsDropdown, setShowTicketsDropdown] = useState<boolean>(false);
  const [showReportsDropdown, setShowReportsDropdown] = useState<boolean>(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<UserRead | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [userAgencyFilter, setUserAgencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [usersPerPage] = useState<number>(10);
  // États pour la section Techniciens
  const [techSearchQuery, setTechSearchQuery] = useState<string>("");
  const [techSpecializationFilter, setTechSpecializationFilter] = useState<string>("all");
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
      { id: 2, priority: "Haute", level: 2, color: "#ff9800", maxTime: "4 heures", maxTimeValue: 4, maxTimeUnit: "heures" },
      { id: 3, priority: "Moyenne", level: 3, color: "#ffc107", maxTime: "1 jour", maxTimeValue: 1, maxTimeUnit: "jour" },
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
      { event: "Ticket Rejeté", active: true, recipients: "Technicien" },
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
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    phone: "",
    agency: "",
    role: "",
    status: "actif",
    password: "",
    confirmPassword: "",
    generateRandomPassword: true,
    sendEmail: true,
    work_hours: "08:30-12:30 / 14:00-17:30",
    availability_status: "disponible"
  });
  const [editUser, setEditUser] = useState({
    full_name: "",
    email: "",
    phone: "",
    agency: "",
    role: "",
    status: "actif",
    work_hours: "08:30-12:30 / 14:00-17:30",
    availability_status: "disponible"
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
    
    const statusValue = user.is_active !== undefined ? (user.is_active ? "actif" : "inactif") : (user.status === "Actif" || user.status === "actif" ? "actif" : "inactif");
    
    setEditUser({
      full_name: user.full_name || user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      agency: user.agency || "",
      role: roleName,
      status: statusValue,
      work_hours: user.work_hours || "08:30-12:30 / 14:00-17:30",
      availability_status: user.availability_status || "disponible"
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
        status: editUser.status
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
        updateData.work_hours = editUser.work_hours;
        updateData.availability_status = editUser.availability_status;
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
      if (file.size > 2 * 1024 * 1024) {
        alert("Le fichier est trop volumineux. Taille maximale : 2MB");
        return;
      }
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        alert("Format non accepté. Utilisez PNG ou JPG");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalAppLogo(reader.result as string);
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

  useEffect(() => {
    async function loadData() {
      try {
        // Charger tous les tickets
        const ticketsRes = await fetch("http://localhost:8000/tickets/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (ticketsRes.ok) {
          const ticketsData = await ticketsRes.json();
          setAllTickets(ticketsData);
          // Calculer les métriques
          const openCount = ticketsData.filter((t: Ticket) => 
            t.status !== "cloture" && t.status !== "resolu"
          ).length;
          setMetrics(prev => ({ ...prev, openTickets: openCount }));
        }

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
              return { ...tech, work_hours: "08h - 17h", workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
            })
          );
          setTechnicians(techsWithStats);
        }

        // Charger les informations de l'utilisateur connecté
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
            agency: meData.agency
          });
          if (meData.role && meData.role.name) {
            setUserRole(meData.role.name);
            
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

        // Calculer les métriques à partir des tickets existants (après chargement)
        // Les métriques de base sont déjà calculées lors du chargement des tickets
        // Ici on complète avec les métriques avancées
        try {
          if (allTickets.length > 0) {
            // Calculer le temps moyen de résolution
            const resolvedTickets = allTickets.filter(t => t.status === "resolu" || t.status === "cloture");
            let totalResolutionTime = 0;
            let resolvedCount = 0;
            
            resolvedTickets.forEach(ticket => {
              // Si le ticket a une date de création, calculer la différence
              if (ticket.created_at) {
                const created = new Date(ticket.created_at);
                const now = new Date();
                const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                totalResolutionTime += diffDays;
                resolvedCount++;
              }
            });
            
            const avgResolutionDays = resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0;
            
            // Calculer la satisfaction implicite en pourcentage
            const rejectedTickets = allTickets.filter(t => t.status === "rejete");
            const resolvedCountPct = resolvedTickets.length;
            const rejectedCountPct = rejectedTickets.length;
            const denomPct = resolvedCountPct + rejectedCountPct;
            const satisfactionPct = denomPct > 0 ? ((resolvedCountPct / denomPct) * 100).toFixed(1) : "0";
            
            // Mettre à jour les métriques (en conservant openTickets déjà calculé)
            setMetrics(prev => ({
              ...prev,
              avgResolutionTime: `${avgResolutionDays} jours`,
              userSatisfaction: `${satisfactionPct}%`,
            }));
          }
        } catch (err) {
          console.log("Erreur calcul métriques:", err);
        }

         // Charger les notifications
         await loadNotifications();
         await loadUnreadCount();
       } catch (err) {
         console.error("Erreur chargement données:", err);
       }
     }
     void loadData();

     // Recharger les notifications toutes les 30 secondes
     const interval = setInterval(() => {
       void loadNotifications();
       void loadUnreadCount();
     }, 30000);
     
    return () => clearInterval(interval);
  }, [token]);

  // Mettre à jour l'heure actuelle toutes les minutes pour recalculer le statut de disponibilité
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Mise à jour toutes les minutes
    
    return () => clearInterval(timeInterval);
  }, []);

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
        const error = await res.json();
        alert(`Erreur: ${error.detail || "Impossible d'assigner le ticket"}`);
      }
    } catch (err) {
      console.error("Erreur assignation:", err);
      alert("Erreur lors de l'assignation");
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
        setViewTicketDetails(ticketId);
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
    'Critique': '#ef4444',
    'Haute': '#f97316',
    'Moyenne': '#f59e0b',
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

  // Fonctions pour analyser les problèmes récurrents
  const getMostFrequentProblems = () => {
    // Analyser les titres de tickets pour trouver des mots-clés récurrents
    const titleWords: { [key: string]: number } = {};
    
    allTickets.forEach(ticket => {
      if (ticket.title) {
        const words = ticket.title.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3) // Ignorer les mots courts
          .filter(word => !['problème', 'ticket', 'demande', 'besoin'].includes(word));
        
        words.forEach(word => {
          titleWords[word] = (titleWords[word] || 0) + 1;
        });
      }
    });

    // Retourner les 5 mots les plus fréquents avec leur nombre d'occurrences
    return Object.entries(titleWords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({
        problème: word.charAt(0).toUpperCase() + word.slice(1),
        occurrences: count
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

    // Retourner les groupes avec plus d'un ticket (problèmes récurrents)
    return Object.entries(ticketGroups)
      .filter(([_, tickets]) => tickets.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
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

  // Filtrer les tickets selon les filtres sélectionnés
  let filteredTickets = allTickets;
  
  if (statusFilter !== "all") {
    if (statusFilter === "en_traitement") {
      filteredTickets = filteredTickets.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours");
    } else {
      filteredTickets = filteredTickets.filter((t) => t.status === statusFilter);
    }
  }

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
            <div style={{ fontSize: "18px", fontWeight: "600" }}>{appName}</div>
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
            cursor: "pointer"
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
        <div style={{ position: "relative" }}>
          <div 
            onClick={() => setShowTicketsDropdown(!showTicketsDropdown)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px", 
              background: activeSection === "tickets" ? "rgba(255,255,255,0.1)" : "transparent",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10,9 9,9 8,9" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>Tickets</div>
            <div style={{ fontSize: "12px" }}>{showTicketsDropdown ? "▼" : "▶"}</div>
          </div>
          {showTicketsDropdown && (
            <div style={{ 
              marginLeft: "36px", 
              marginTop: "8px", 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px" 
            }}>
              <div 
                onClick={() => {
                  setStatusFilter("all");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "all" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Tous les tickets
              </div>
              <div 
                onClick={() => {
                  setStatusFilter("en_attente_analyse");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "en_attente_analyse" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                En attente
              </div>
              <div 
                onClick={() => {
                  setStatusFilter("en_traitement");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "en_traitement" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                En traitement
              </div>
              <div 
                onClick={() => {
                  setStatusFilter("resolu");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "resolu" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Résolus
              </div>
              <div 
                onClick={() => {
                  setStatusFilter("cloture");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "cloture" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Clôturés
              </div>
              <div 
                onClick={() => {
                  setStatusFilter("rejete");
                  setActiveSection("tickets");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: statusFilter === "rejete" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Rejetés
              </div>
            </div>
          )}
        </div>
        {userRole !== "Admin" && (
          <div 
            onClick={() => setActiveSection("technicians")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "technicians" ? "rgba(255,255,255,0.1)" : "transparent"
            }}
          >
            <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div style={{ flex: 1 }}>Techniciens</div>
          </div>
        )}
        {userRole === "Admin" && (
          <div 
            onClick={() => setActiveSection("users")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "users" ? "rgba(255,255,255,0.1)" : "transparent"
            }}
          >
            <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div style={{ flex: 1 }}>Utilisateurs</div>
          </div>
        )}
        <div style={{ position: "relative" }}>
          <div 
            onClick={() => setShowReportsDropdown(!showReportsDropdown)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px", 
              background: activeSection === "reports" ? "rgba(255,255,255,0.1)" : "transparent",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>Rapports</div>
            <div style={{ fontSize: "12px" }}>{showReportsDropdown ? "▼" : "▶"}</div>
          </div>
          {showReportsDropdown && (
            <div style={{ 
              marginLeft: "36px", 
              marginTop: "8px", 
              display: "flex", 
              flexDirection: "column", 
              gap: "4px" 
            }}>
              <div 
                onClick={() => {
                  setSelectedReport("statistiques");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "statistiques" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Statistiques générales
              </div>
              <div 
                onClick={() => {
                  setSelectedReport("metriques");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "metriques" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Métriques de performance
              </div>
              <div 
                onClick={() => {
                  setSelectedReport("agence");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "agence" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Analyses par agence
              </div>
              <div 
                onClick={() => {
                  setSelectedReport("technicien");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "technicien" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Analyses par technicien
              </div>
              <div 
                onClick={() => {
                  setSelectedReport("evolutions");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "evolutions" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Évolutions dans le temps
              </div>
              <div 
                onClick={() => {
                  setSelectedReport("recurrents");
                  setActiveSection("reports");
                }}
                style={{ 
                  padding: "8px 12px", 
                  borderRadius: "4px", 
                  cursor: "pointer",
                  background: selectedReport === "recurrents" ? "rgba(255,255,255,0.1)" : "transparent"
                }}
              >
                Problèmes récurrents
              </div>
            </div>
          )}
        </div>
        {userRole === "Admin" && (
          <div 
            onClick={() => setActiveSection("maintenance")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "maintenance" ? "rgba(255,255,255,0.1)" : "transparent"
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
            onClick={() => setActiveSection("audit-logs")}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "12px 16px", 
              cursor: "pointer",
              color: "white",
              borderRadius: "4px",
              background: activeSection === "audit-logs" ? "rgba(255,255,255,0.1)" : "transparent"
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
                background: activeSection === "settings" ? "rgba(255,255,255,0.1)" : "transparent"
              }}
            >
              <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"></path>
                </svg>
              </div>
              <div style={{ flex: 1 }}>Paramètres</div>
              <div style={{ fontSize: "12px" }}>{showSettingsDropdown ? "▼" : "▶"}</div>
            </div>
            {showSettingsDropdown && (
              <div style={{ 
                marginLeft: "36px", 
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
                    background: activeSection === "apparence" ? "rgba(255,255,255,0.1)" : "transparent",
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
                    background: activeSection === "email" ? "rgba(255,255,255,0.1)" : "transparent",
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
                    background: activeSection === "securite" ? "rgba(255,255,255,0.1)" : "transparent",
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
                    background: activeSection === "types-tickets" ? "rgba(255,255,255,0.1)" : "transparent",
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
                    background: activeSection === "priorites" ? "rgba(255,255,255,0.1)" : "transparent",
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
                    background: activeSection === "departements" ? "rgba(255,255,255,0.1)" : "transparent",
                    fontSize: "14px"
                  }}
                >
                  Départements
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Barre de navigation en haut */}
        <div style={{
          background: "#1e293b",
          padding: "16px 30px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "24px",
          borderBottom: "1px solid #0f172a"
        }}>
          <div style={{ 
            cursor: "pointer", 
            width: "24px", 
            height: "24px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "white"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor"/>
              <path d="M19 13a2 2 0 0 1-2 2H5l-4 4V3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="currentColor" opacity="0.6" transform="translate(2, 2)"/>
            </svg>
          </div>
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

        {/* Contenu principal avec scroll */}
        <div style={{ flex: 1, padding: "30px", overflow: "auto" }}>
          {activeSection === "dashboard" && (
            <>
              <h2 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>Tableau de bord - DSI</h2>

      {/* Métriques */}
      <div style={{ display: "flex", gap: "16px", margin: "24px 0" }}>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ff9800" }}>{pendingCount}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Tickets en attente</div>
        </div>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#2196f3" }}>{assignedCount}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Tickets assignés</div>
        </div>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4caf50" }}>{resolvedCount}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Tickets résolus</div>
        </div>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#2196f3" }}>{metrics.openTickets}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Tickets ouverts</div>
        </div>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ff9800" }}>{metrics.avgResolutionTime}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Temps moyen</div>
        </div>
        <div style={{ padding: "16px", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", flex: 1 }}>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4caf50" }}>{metrics.userSatisfaction}</div>
          <div style={{ color: "#666", marginTop: "4px" }}>Satisfaction</div>
        </div>
      </div>

      {/* Tableau des tickets récents */}
      <h3 style={{ marginTop: "32px", marginBottom: "16px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Tickets Récents</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
        <thead>
          <tr style={{ background: "#f8f9fa" }}>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>ID</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Titre</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Nom</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Agence</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Priorité</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Statut</th>
            <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            // Trier les tickets par date de création (plus récents en premier) et prendre les 5 premiers
            const recentTickets = [...allTickets]
              .sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA; // Tri décroissant (plus récent en premier)
              })
              .slice(0, 5); // Prendre les 5 premiers

            if (recentTickets.length === 0) {
              return (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px", color: "#999" }}>
                    Aucun ticket
                  </td>
                </tr>
              );
            }

            return recentTickets.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "12px 16px" }}>#{t.number}</td>
                <td style={{ padding: "12px 16px" }}>{t.title}</td>
                <td style={{ padding: "12px 16px" }}>
                  {t.creator ? t.creator.full_name : "N/A"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {t.creator ? (t.creator.agency || t.user_agency || "N/A") : (t.user_agency || "N/A")}
                </td>
                <td style={{ padding: "12px 16px" }}>
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
                <td style={{ padding: "12px 16px" }}>
                  <span style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "500",
                    background: t.status === "en_attente_analyse" ? "#fef3c7" : 
                               t.status === "assigne_technicien" ? "#dbeafe" : 
                               t.status === "en_cours" ? "#fed7aa" : 
                               t.status === "resolu" ? "#d4edda" : 
                               t.status === "cloture" ? "#e5e7eb" :
                               t.status === "rejete" ? "#fee2e2" : "#e5e7eb",
                    color: t.status === "en_attente_analyse" ? "#92400e" : 
                           t.status === "assigne_technicien" ? "#1e40af" : 
                           t.status === "en_cours" ? "#9a3412" : 
                           t.status === "resolu" ? "#155724" : 
                           t.status === "cloture" ? "#374151" :
                           t.status === "rejete" ? "#991b1b" : "#374151",
                    whiteSpace: "nowrap",
                    display: "inline-block"
                  }}>
                    {t.status === "en_attente_analyse" ? "En attente" :
                     t.status === "assigne_technicien" ? "Assigné" :
                     t.status === "en_cours" ? "En cours" :
                     t.status === "resolu" ? "Résolu" :
                     t.status === "cloture" ? "Clôturé" :
                     t.status === "rejete" ? "Rejeté" : t.status}
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {t.status === "en_attente_analyse" ? (
                    // Actions pour tickets en attente
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => loadTicketDetails(t.id)}
                        disabled={loading}
                        style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Voir détails
                      </button>
                      <button
                        onClick={() => handleAssignClick(t.id)}
                        disabled={loading}
                        style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                      >
                        Assigner
                      </button>
                      {canEscalate() && (
                        <button
                          onClick={() => handleEscalate(t.id)}
                          disabled={loading}
                          style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#ff9800", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                        >
                          Escalader
                        </button>
                      )}
                    </div>
                  ) : t.status === "assigne_technicien" || t.status === "en_cours" ? (
                    // Actions pour tickets assignés/en cours
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => loadTicketDetails(t.id)}
                        disabled={loading}
                        style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Voir détails
                      </button>
                      <button
                        onClick={() => handleReassignClick(t.id)}
                        disabled={loading}
                        style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                      >
                        Réassigner
                      </button>
                      {canEscalate() && (
                        <button
                          onClick={() => handleEscalate(t.id)}
                          disabled={loading}
                          style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#ff9800", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                        >
                          Escalader
                        </button>
                      )}
                    </div>
                  ) : t.status === "resolu" ? (
                    // Action pour tickets résolus
                    <button
                      onClick={() => handleClose(t.id)}
                      disabled={loading}
                      style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                    >
                      Clôturer
                    </button>
                  ) : t.status === "rejete" ? (
                    // Action pour tickets rejetés - Réouverture
                    <button
                      onClick={() => handleReopenClick(t.id)}
                      disabled={loading}
                      style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                    >
                      Réouvrir
                    </button>
                  ) : (
                    // Pas d'action pour tickets clôturés
                    <span style={{ color: "#999", fontSize: "12px" }}>
                      {t.status === "cloture" ? "Clôturé" : "N/A"}
                    </span>
                  )}
                </td>
              </tr>
            ));
          })()}
        </tbody>
      </table>
    </>
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

          {activeSection === "tickets" && (
            <>
              <h2 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>Tous les tickets</h2>
              
              <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>ID</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Titre</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Nom</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Agence</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Priorité</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Statut</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "20px", color: "#999" }}>
                        Aucun ticket
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "12px 16px" }}>#{t.number}</td>
                        <td style={{ padding: "12px 16px" }}>{t.title}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {t.creator ? t.creator.full_name : "N/A"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {t.creator ? (t.creator.agency || t.user_agency || "N/A") : (t.user_agency || "N/A")}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
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
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "500",
                            background: t.status === "en_attente_analyse" ? "#fef3c7" : 
                                       t.status === "assigne_technicien" ? "#dbeafe" : 
                                       t.status === "en_cours" ? "#fed7aa" : 
                                       t.status === "resolu" ? "#e5e7eb" : 
                                       t.status === "cloture" ? "#e5e7eb" :
                                       t.status === "rejete" ? "#fee2e2" : "#e5e7eb",
                            color: t.status === "en_attente_analyse" ? "#92400e" : 
                                   t.status === "assigne_technicien" ? "#1e40af" : 
                                   t.status === "en_cours" ? "#9a3412" : 
                                   t.status === "resolu" ? "#374151" : 
                                   t.status === "cloture" ? "#374151" :
                                   t.status === "rejete" ? "#991b1b" : "#374151",
                            whiteSpace: "nowrap",
                            display: "inline-block"
                          }}>
                            {t.status === "en_attente_analyse" ? "En attente" :
                             t.status === "assigne_technicien" ? "Assigné" :
                             t.status === "en_cours" ? "En cours" :
                             t.status === "resolu" ? "Résolu" :
                             t.status === "cloture" ? "Clôturé" :
                             t.status === "rejete" ? "Rejeté" : t.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {t.status === "en_attente_analyse" ? (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              <button
                                onClick={() => handleAssignClick(t.id)}
                                disabled={loading}
                                  style={{ 
                                    fontSize: "12px", 
                                    padding: "6px 12px", 
                            backgroundColor: "#007bff", 
                            color: "white", 
                            border: "none",
                            borderRadius: "4px",
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontWeight: "500",
                                    transition: "all 0.2s ease",
                                    opacity: loading ? 0.6 : 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!loading) {
                                      e.currentTarget.style.backgroundColor = "#bfdbfe";
                                      e.currentTarget.style.borderColor = "#60a5fa";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!loading) {
                                      e.currentTarget.style.backgroundColor = "#dbeafe";
                                      e.currentTarget.style.borderColor = "#93c5fd";
                                    }
                                  }}
                                >
                                  Assigner
                                </button>
                                {canEscalate() && (
                                  <button
                                    onClick={() => handleEscalate(t.id)}
                                    disabled={loading}
                                    style={{ 
                                      fontSize: "12px", 
                                      padding: "6px 12px", 
                            backgroundColor: "#ff9800", 
                            color: "white", 
                            border: "none",
                            borderRadius: "4px",
                                      cursor: loading ? "not-allowed" : "pointer",
                                      fontWeight: "500",
                                      transition: "all 0.2s ease",
                                      opacity: loading ? 0.6 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#fcd34d";
                                        e.currentTarget.style.borderColor = "#f59e0b";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#fed7aa";
                                        e.currentTarget.style.borderColor = "#fdba74";
                                      }
                                    }}
                                  >
                                    Escalader
                                  </button>
                        )}
                      </div>
                  ) : t.status === "assigne_technicien" || t.status === "en_cours" ? (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              <button
                                onClick={() => handleReassignClick(t.id)}
                                disabled={loading}
                                style={{ 
                                  fontSize: "12px", 
                                  padding: "6px 12px", 
                            backgroundColor: "#17a2b8", 
                            color: "white", 
                            border: "none",
                            borderRadius: "4px",
                                  cursor: loading ? "not-allowed" : "pointer",
                                  fontWeight: "500",
                                  transition: "all 0.2s ease",
                                  opacity: loading ? 0.6 : 1
                                }}
                                onMouseEnter={(e) => {
                                  if (!loading) {
                                    e.currentTarget.style.backgroundColor = "#138496";
                                    e.currentTarget.style.borderColor = "#117a8b";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!loading) {
                                    e.currentTarget.style.backgroundColor = "#17a2b8";
                                    e.currentTarget.style.borderColor = "#17a2b8";
                                  }
                                }}
                              >
                                Réassigner
                              </button>
                                {canEscalate() && (
                                  <button
                                    onClick={() => handleEscalate(t.id)}
                                    disabled={loading}
                                    style={{ 
                                      fontSize: "12px", 
                                      padding: "6px 12px", 
                            backgroundColor: "#ff9800", 
                            color: "white", 
                            border: "none",
                            borderRadius: "4px",
                                      cursor: loading ? "not-allowed" : "pointer",
                                      fontWeight: "500",
                                      transition: "all 0.2s ease",
                                      opacity: loading ? 0.6 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#fcd34d";
                                        e.currentTarget.style.borderColor = "#f59e0b";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#fed7aa";
                                        e.currentTarget.style.borderColor = "#fdba74";
                                      }
                                    }}
                                  >
                                    Escalader
                                  </button>
                                )}
                              </div>
                          ) : t.status === "resolu" ? (
                            <button
                              onClick={() => handleClose(t.id)}
                              disabled={loading}
                              style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                            >
                              Clôturer
                            </button>
                          ) : t.status === "rejete" ? (
                            <button
                              onClick={() => handleReopenClick(t.id)}
                              disabled={loading}
                              style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                            >
                              Réouvrir
                            </button>
                          ) : (
                            <span style={{ color: "#999", fontSize: "12px" }}>
                              {t.status === "cloture" ? "Clôturé" : "N/A"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}

          {activeSection === "reports" && (
            <>
              <h2 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>Rapports et Métriques</h2>
              
              {!selectedReport && !showGenerateReport && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <p style={{ color: "#666", fontSize: "16px", marginBottom: "20px" }}>Sélectionnez un type de rapport dans le menu latéral</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("statistiques")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>📊 Statistiques générales</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Nombre total, répartition par statut, priorité, type</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("metriques")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>⚡ Métriques de performance</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Temps moyen, satisfaction, escalades, réouvertures</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("agence")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>🏢 Analyses par agence</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Volume, temps moyen, satisfaction par agence</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("technicien")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>👥 Analyses par technicien</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Tickets traités, temps moyen, charge, satisfaction</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("evolutions")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>📈 Évolutions dans le temps</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Tendances, pics d'activité, performance</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid #eee", borderRadius: "8px", cursor: "pointer" }} onClick={() => setSelectedReport("recurrents")}>
                      <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#333" }}>🔄 Problèmes récurrents</h3>
                      <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>Types fréquents, agences, patterns</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedReport === "statistiques" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Statistiques générales</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff", marginBottom: "8px" }}>{allTickets.length}</div>
                      <div style={{ color: "#666" }}>Nombre total de tickets</div>
                    </div>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#28a745", marginBottom: "8px" }}>{resolvedCount + closedTickets.length}</div>
                      <div style={{ color: "#666" }}>Tickets résolus/clôturés</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par statut</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Statut</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Nombre</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Pourcentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: "12px" }}>En attente</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{pendingCount}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((pendingCount / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Assignés/En cours</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{assignedCount}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((assignedCount / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Résolus</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{resolvedCount}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((resolvedCount / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Clôturés</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{closedTickets.length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((closedTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Rejetés</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{rejectedTickets.length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((rejectedTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par priorité</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Priorité</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Nombre</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Pourcentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["critique", "haute", "moyenne", "faible"].map((priority) => {
                          const count = allTickets.filter((t) => t.priority === priority).length;
                          return (
                            <tr key={priority}>
                              <td style={{ padding: "12px", textTransform: "capitalize" }}>{priority}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{count}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((count / allTickets.length) * 100).toFixed(1) : 0}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter PDF</button>
                    <button style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter Excel</button>
                  </div>
                </div>
              )}

              {selectedReport === "metriques" && (() => {
                // Calculer le temps moyen de résolution réel
                const resolvedTickets = allTickets.filter(t => t.status === "resolu" || t.status === "cloture");
                let totalResolutionTime = 0;
                let countWithDates = 0;
                
                resolvedTickets.forEach(ticket => {
                  if (ticket.created_at) {
                    const created = new Date(ticket.created_at);
                    const now = new Date();
                    const diffTime = now.getTime() - created.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    totalResolutionTime += diffDays;
                    countWithDates++;
                  }
                });
                
                const avgResolutionDays = countWithDates > 0 ? Math.round(totalResolutionTime / countWithDates) : 0;
                const avgResolutionTimeDisplay = avgResolutionDays === 0 ? "0 jours" : `${avgResolutionDays} jour${avgResolutionDays > 1 ? 's' : ''}`;
                
                // Calculer la satisfaction (implicite) en pourcentage
                const rejectedTicketsRpt = allTickets.filter(t => t.status === "rejete");
                const resolvedCountRpt = resolvedTickets.length;
                const rejectedCountRpt = rejectedTicketsRpt.length;
                const denomRpt = resolvedCountRpt + rejectedCountRpt;
                const satisfactionDisplay = `${denomRpt > 0 ? ((resolvedCountRpt / denomRpt) * 100).toFixed(1) : "0"}%`;
                
                // Calculer les tickets escaladés (critiques en cours)
                const escalatedTickets = allTickets.filter((t) => 
                  t.priority === "critique" && 
                  (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours")
                ).length;
                
                // Calculer le taux de réouverture (tickets qui ont été rejetés puis réouverts)
                // Pour simplifier, on considère qu'un ticket réouvert est un ticket qui a été rejeté puis a changé de statut
                const reopenedTickets = allTickets.filter(t => {
                  // Si un ticket a été rejeté et a maintenant un autre statut, c'est qu'il a été réouvert
                  // Note: Cette logique peut être améliorée si on a un historique des statuts
                  return t.status === "rejete" && allTickets.some(tt => 
                    tt.id === t.id && 
                    tt.status !== "rejete" && 
                    tt.status !== t.status
                  );
                }).length;
                
                const rejectionRate = rejectedTickets.length > 0 
                  ? ((reopenedTickets / rejectedTickets.length) * 100).toFixed(1) 
                  : "0.0";
                const reopeningRateDisplay = `${rejectionRate}%`;
                
                return (
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                    <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Métriques de performance</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ff9800", marginBottom: "8px" }}>{avgResolutionTimeDisplay}</div>
                        <div style={{ color: "#666" }}>Temps moyen de résolution</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4caf50", marginBottom: "8px" }}>{satisfactionDisplay}</div>
                        <div style={{ color: "#666" }}>Taux de satisfaction utilisateur</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#dc3545", marginBottom: "8px" }}>
                          {escalatedTickets}
                        </div>
                        <div style={{ color: "#666" }}>Tickets escaladés (critiques en cours)</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#17a2b8", marginBottom: "8px" }}>
                          {reopeningRateDisplay}
                        </div>
                        <div style={{ color: "#666" }}>Taux de réouverture</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                      <button style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter PDF</button>
                      <button style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter Excel</button>
                    </div>
                  </div>
                );
              })()}

              {selectedReport === "agence" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Analyses par agence</h3>
                  
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
                          return (
                            <tr key={agency}>
                              <td style={{ padding: "12px" }}>{agency}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{agencyTickets.length}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>N/A</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>N/A</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter PDF</button>
                    <button style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter Excel</button>
                  </div>
                </div>
              )}

              {selectedReport === "technicien" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Analyses par technicien</h3>
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
                          return (
                            <tr key={tech.id}>
                              <td style={{ padding: "12px" }}>{tech.full_name}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{techTickets.filter((t) => t.status === "resolu" || t.status === "cloture").length}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>N/A</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{inProgress}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>N/A</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter PDF</button>
                    <button style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter Excel</button>
                  </div>
                </div>
              )}

              {selectedReport === "evolutions" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "24px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Évolutions dans le temps</h3>
                  
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
                    <button style={{ padding: "10px 20px", backgroundColor: colors.primary, color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500" }}>Exporter PDF</button>
                    <button style={{ padding: "10px 20px", backgroundColor: colors.success, color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500" }}>Exporter Excel</button>
                  </div>
                </div>
              )}

              {selectedReport === "recurrents" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ marginBottom: "16px" }}>
                    <h3 style={{ marginBottom: "8px", fontSize: "22px", fontWeight: "600", color: "#333" }}>PROBLÈMES RÉCURRENTS</h3>
                    <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>Identification des problèmes qui reviennent souvent</p>
                  </div>

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
                    <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px" }}>
                      {getRecurringTicketsHistory().length > 0 ? (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "transparent" }}>
                              <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6", fontSize: "12px", fontWeight: "600", color: "#666" }}>Problème</th>
                              <th style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #dee2e6", fontSize: "12px", fontWeight: "600", color: "#666" }}>Occurrences</th>
                              <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6", fontSize: "12px", fontWeight: "600", color: "#666" }}>Dernière occurrence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getRecurringTicketsHistory().map((item, index) => (
                              <tr key={index} style={{ borderBottom: index < getRecurringTicketsHistory().length - 1 ? "1px solid #dee2e6" : "none" }}>
                                <td style={{ padding: "12px", color: "#333", fontSize: "14px" }}>{item.titre}</td>
                                <td style={{ padding: "12px", textAlign: "center" }}>
                                  <span style={{ 
                                    background: "#e3f2fd", 
                                    color: "#1976d2",
                                    padding: "4px 12px",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    fontWeight: "600"
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
                    <button style={{ 
                      padding: "10px 20px", 
                      backgroundColor: "#007bff", 
                      color: "white", 
                      border: "none", 
                      borderRadius: "8px", 
                      cursor: "pointer",
                      fontWeight: "500"
                    }}>
                      [Voir Rapport]
                    </button>
                    <button style={{ 
                      padding: "10px 20px", 
                      backgroundColor: "#28a745", 
                      color: "white", 
                      border: "none", 
                      borderRadius: "8px", 
                      cursor: "pointer",
                      fontWeight: "500"
                    }}>
                      Exporter PDF
                    </button>
                    <button style={{ 
                      padding: "10px 20px", 
                      backgroundColor: "#17a2b8", 
                      color: "white", 
                      border: "none", 
                      borderRadius: "8px", 
                      cursor: "pointer",
                      fontWeight: "500"
                    }}>
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
                 const isActive = u.is_active !== false;
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
                         const isActive = user.is_active !== false;
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h2 style={{ fontSize: "28px", fontWeight: "600", color: "#333", margin: 0 }}>Gestion des Techniciens</h2>
                {/* Bouton de création masqué pour DSI et rôles non-admin */}
              </div>

              {/* Barre de recherche et filtres */}
              <div style={{ 
                background: "white", 
                borderRadius: "8px", 
                padding: "16px", 
                marginBottom: "20px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap"
              }}>
                {/* Recherche */}
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <input
                    type="text"
                    placeholder="Rechercher par nom ou email..."
                    value={techSearchQuery}
                    onChange={(e) => setTechSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                {/* Filtre par spécialisation */}
                <div style={{ minWidth: "150px" }}>
                  <select
                    value={techSpecializationFilter}
                    onChange={(e) => setTechSpecializationFilter(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px",
                      background: "white",
                      cursor: "pointer"
                    }}
                  >
                    <option value="all">Toutes les spécialisations</option>
                    <option value="materiel">Matériel</option>
                    <option value="applicatif">Applicatif</option>
                  </select>
                </div>

                {/* Bouton pour réinitialiser les filtres */}
                {(techSearchQuery || techSpecializationFilter !== "all") && (
                  <button
                    onClick={() => {
                      setTechSearchQuery("");
                      setTechSpecializationFilter("all");
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
               
               {/* Grille de cartes des techniciens */}
               {(() => {
                 // Filtrer les techniciens
                 let filteredTechnicians = technicians;
                 
                 // Filtre par recherche
                 if (techSearchQuery) {
                   const query = techSearchQuery.toLowerCase();
                   filteredTechnicians = filteredTechnicians.filter((tech: any) =>
                     tech.full_name?.toLowerCase().includes(query) ||
                     tech.email?.toLowerCase().includes(query)
                   );
                 }
                 
                 // Filtre par spécialisation
                 if (techSpecializationFilter !== "all") {
                   filteredTechnicians = filteredTechnicians.filter((tech: any) =>
                     tech.specialization === techSpecializationFilter
                   );
                 }
                 
                 if (filteredTechnicians.length === 0) {
                   return (
                     <div style={{ 
                       background: "white", 
                       borderRadius: "8px", 
                       padding: "40px", 
                       textAlign: "center", 
                       color: "#999",
                       boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                     }}>
                       Aucun technicien trouvé
                     </div>
                   );
                 }
                 
                 return (
                   <div style={{ 
                     display: "grid", 
                     gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", 
                     gap: "24px" 
                   }}>
                     {filteredTechnicians.map((tech: any) => {
                       // Obtenir les initiales
                       const initials = tech.full_name
                         .split(" ")
                         .map((n: string) => n[0])
                         .join("")
                         .toUpperCase()
                         .substring(0, 2);
                       
                       // Déterminer le statut de disponibilité basé sur les horaires
                       const currentStatus = getAvailabilityStatus(tech);
                       
                       // Couleur de l'avatar basée sur la spécialisation
                       const avatarColor = tech.specialization === "materiel" ? "#ffc107" : "#28a745";
                       
                       // Compétences basées sur la spécialisation
                       const skills = tech.specialization === "materiel" 
                         ? ["Hardware", "Imprimantes", "Téléphonie"]
                         : ["Réseau", "Logiciel", "Applications"];
                       
                       return (
                         <div
                           key={tech.id}
                           style={{
                             background: "white",
                             borderRadius: "12px",
                             padding: "20px",
                             boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                             display: "flex",
                             flexDirection: "column",
                             gap: "16px"
                           }}
                         >
                           {/* En-tête avec avatar et titre */}
                           <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                             <div style={{
                               width: "60px",
                               height: "60px",
                               borderRadius: "50%",
                               background: avatarColor,
                               display: "flex",
                               alignItems: "center",
                               justifyContent: "center",
                               color: "white",
                               fontSize: "20px",
                               fontWeight: "700",
                               flexShrink: 0
                             }}>
                               {initials}
                             </div>
                             <div style={{ flex: 1 }}>
                               <div style={{ fontSize: "18px", fontWeight: "700", color: "#333", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                                 {tech.full_name}
                                <span style={{
                                  padding: "2px 8px",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  background:
                                    currentStatus === "disponible" ? "#d4edda" :
                                    currentStatus === "occupé" ? "#fff3cd" :
                                    currentStatus === "en pause" ? "#fde68a" :
                                    "#e5e7eb",
                                  color:
                                    currentStatus === "disponible" ? "#155724" :
                                    currentStatus === "occupé" ? "#856404" :
                                    currentStatus === "en pause" ? "#92400e" :
                                    "#374151"
                                }}>
                                  {currentStatus === "disponible"
                                    ? "Disponible"
                                    : currentStatus === "occupé"
                                    ? "Occupé"
                                    : currentStatus === "en pause"
                                    ? "En pause"
                                    : "Indisponible"}
                                </span>
                               </div>
                               <span style={{
                                 padding: "4px 10px",
                                 borderRadius: "12px",
                                 fontSize: "12px",
                                 fontWeight: "500",
                                 background: tech.specialization === "materiel" ? "#fff3cd" : "#d1ecf1",
                                 color: tech.specialization === "materiel" ? "#856404" : "#0c5460"
                               }}>
                                 {tech.specialization === "materiel" ? "Matériel" : "Applicatif"}
                               </span>
                             </div>
                           </div>
                           
                           {/* Horaires de travail */}
                           <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666", fontSize: "14px" }}>
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                               <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                               <line x1="16" y1="2" x2="16" y2="6" />
                               <line x1="8" y1="2" x2="8" y2="6" />
                               <line x1="3" y1="10" x2="21" y2="10" />
                             </svg>
                             <span>{tech.work_hours || "08h - 17h"}</span>
                           </div>
                           
                           {/* Statistiques visuelles */}
                           <div style={{ 
                             display: "grid", 
                             gridTemplateColumns: "repeat(3, 1fr)", 
                             gap: "12px",
                             padding: "16px",
                             background: "#f8f9fa",
                             borderRadius: "8px"
                           }}>
                             <div style={{ textAlign: "center" }}>
                               <div style={{ fontSize: "24px", fontWeight: "700", color: "#007bff", marginBottom: "4px" }}>
                                 {tech.in_progress_tickets_count || 0}
                               </div>
                               <div style={{ fontSize: "12px", color: "#666" }}>En cours</div>
                             </div>
                             <div style={{ textAlign: "center" }}>
                               <div style={{ fontSize: "24px", fontWeight: "700", color: "#28a745", marginBottom: "4px" }}>
                                 {tech.closed_tickets_count || 0}
                               </div>
                               <div style={{ fontSize: "12px", color: "#666" }}>Résolus</div>
                             </div>
                             <div style={{ textAlign: "center" }}>
                               <div style={{ fontSize: "24px", fontWeight: "700", color: "#007bff", marginBottom: "4px" }}>
                                 {tech.resolved_today || 0}
                               </div>
                               <div style={{ fontSize: "12px", color: "#666" }}>Aujourd'hui</div>
                             </div>
                           </div>
                           
                           {/* Temps de réponse moyen et Charge de travail */}
                           <div style={{ 
                             display: "flex", 
                             justifyContent: "space-between",
                             padding: "12px",
                             background: "#f8f9fa",
                             borderRadius: "8px"
                           }}>
                             <div>
                               <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Temps de réponse moyen</div>
                               <div style={{ fontSize: "18px", fontWeight: "700", color: "#333" }}>
                                 {tech.avg_response_time_minutes || 0} min
                               </div>
                             </div>
                             <div style={{ textAlign: "right" }}>
                               <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Charge de travail</div>
                               <div style={{ fontSize: "18px", fontWeight: "700", color: "#ffc107" }}>
                                 {tech.workload_ratio || "0/5"}
                               </div>
                             </div>
                           </div>
                           
                           {/* Contact */}
                           <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                             <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666", fontSize: "14px" }}>
                               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                 <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                 <polyline points="22,6 12,13 2,6" />
                               </svg>
                               <span>{tech.email}</span>
                             </div>
                             {tech.phone && (
                               <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666", fontSize: "14px" }}>
                                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                   <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                 </svg>
                                 <span>{tech.phone}</span>
                               </div>
                             )}
                           </div>
                           
                           {/* Compétences */}
                           <div>
                             <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                               {skills.map((skill: string, index: number) => (
                                 <span
                                   key={index}
                                   style={{
                                     padding: "4px 10px",
                                     borderRadius: "12px",
                                     fontSize: "12px",
                                     fontWeight: "500",
                                     background: "#e3f2fd",
                                     color: "#1565c0"
                                   }}
                                 >
                                   {skill}
                                 </span>
                               ))}
                             </div>
                           </div>
                           
                           {/* Actions */}
                           <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                             <button
                               onClick={async () => {
                                 setLoadingTechnicianStats(true);
                                 try {
                                   const res = await fetch(`http://localhost:8000/users/technicians/${tech.id}/stats`, {
                                     headers: {
                                       Authorization: `Bearer ${token}`,
                                     },
                                   });
                                   if (res.ok) {
                                     const stats = await res.json();
                                     setSelectedTechnicianDetails({ ...tech, ...stats });
                                     setShowTechnicianDetailsModal(true);
                                   } else {
                                     setSelectedTechnicianDetails(tech);
                                     setShowTechnicianDetailsModal(true);
                                   }
                                 } catch (err) {
                                   console.error("Erreur:", err);
                                   setSelectedTechnicianDetails(tech);
                                   setShowTechnicianDetailsModal(true);
                                 } finally {
                                   setLoadingTechnicianStats(false);
                                 }
                               }}
                               style={{
                                 flex: 1,
                                 padding: "8px 12px",
                                 background: "white",
                                 border: "1px solid #007bff",
                                 borderRadius: "6px",
                                 color: "#007bff",
                                 cursor: "pointer",
                                 fontSize: "14px",
                                 fontWeight: "500",
                                 display: "flex",
                                 alignItems: "center",
                                 justifyContent: "center",
                                 gap: "6px"
                               }}
                             >
                               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                 <circle cx="12" cy="12" r="3" />
                               </svg>
                               Voir Profil
                             </button>
                            {/* Boutons Modifier/Supprimer masqués pour DSI et rôles non-admin */}
                          </div>
                         </div>
                       );
                     })}
                   </div>
                 );
               })()}
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
                           background: selectedTechnicianDetails.status === "actif" ? "#28a745" : "#6c757d",
                           color: "white",
                           whiteSpace: "nowrap"
                         }}>
                           {selectedTechnicianDetails.status === "actif" ? "Actif" : "Inactif"}
                         </span>
                       </div>
                       <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                         <span style={{ fontWeight: "600", color: "#666", minWidth: "120px" }}>Disponibilité:</span>
                         <span style={{
                           padding: "4px 8px",
                           borderRadius: "12px",
                           fontSize: "12px",
                           fontWeight: "500",
                           background: selectedTechnicianDetails.availability_status === "disponible" ? "#28a745" : selectedTechnicianDetails.availability_status === "occupé" ? "#ffc107" : "#6c757d",
                           color: "white",
                           whiteSpace: "nowrap"
                         }}>
                           {selectedTechnicianDetails.availability_status === "disponible" ? "Disponible" : selectedTechnicianDetails.availability_status === "occupé" ? "Occupé" : "Non défini"}
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
                       work_hours: (e.target as any).work_hours?.value || null,
                       availability_status: (e.target as any).availability_status?.value || "disponible",
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
                             return { ...tech, work_hours: "08h - 17h", workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
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
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Plages horaires</label>
                       <input
                         type="text"
                         name="work_hours"
                         placeholder="Ex: 08:30-12:30 / 14:00-17:30"
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
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Statut de disponibilité</label>
                       <select
                         name="availability_status"
                         defaultValue="disponible"
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           background: "white"
                         }}
                       >
                         <option value="disponible">Disponible</option>
                         <option value="occupé">Occupé</option>
                         <option value="en pause">En pause</option>
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
                       work_hours: (e.target as any).work_hours?.value || null,
                       availability_status: (e.target as any).availability_status?.value || null,
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
                             return { ...tech, work_hours: "08h - 17h", workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
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
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Plages horaires</label>
                       <input
                         type="text"
                         name="work_hours"
                         placeholder="Ex: 08:30-12:30 / 14:00-17:30"
                         defaultValue={editingTechnician.work_hours || ""}
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
                       <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>Statut de disponibilité</label>
                       <select
                         name="availability_status"
                         defaultValue={editingTechnician.availability_status || "disponible"}
                         style={{
                           width: "100%",
                           padding: "10px",
                           border: "1px solid #ddd",
                           borderRadius: "5px",
                           fontSize: "14px",
                           background: "white"
                         }}
                       >
                         <option value="disponible">Disponible</option>
                         <option value="occupé">Occupé</option>
                         <option value="en pause">En pause</option>
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
                                 return { ...tech, work_hours: "08h - 17h", workload_ratio: "0/5", resolved_today: 0, avg_response_time_minutes: 0 };
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

        </div>
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
                       {["Actif", "Inactif"].map((status) => (
                         <label key={status} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="status"
                             value={status.toLowerCase()}
                             checked={newUser.status === status.toLowerCase()}
                             onChange={(e) => setNewUser({ ...newUser, status: e.target.value })}
                             required
                             style={{ cursor: "pointer" }}
                           />
                           <span>{status}</span>
                         </label>
                       ))}
                     </div>
                   </div>
                 </div>
               </div>

               {/* Informations Technicien (conditionnel) */}
               {(newUser.role === "Technicien (Matériel)" || newUser.role === "Technicien (Applicatif)") && (
                 <div style={{ marginBottom: "24px" }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Technicien</h3>
                   <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #17a2b8", background: "#f8f9fa" }}>
                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Horaires de Travail
                       </label>
                       <input
                         type="text"
                         value={newUser.work_hours}
                         onChange={(e) => setNewUser({ ...newUser, work_hours: e.target.value })}
                         style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                         placeholder="Ex: 08:30-12:30 / 14:00-17:30"
                       />
                       <small style={{ display: "block", marginTop: "4px", color: "#666", fontSize: "12px" }}>
                         Format recommandé: "08:30-12:30 / 14:00-17:30" ou "9h-18h"
                       </small>
                     </div>
                     <div style={{ marginBottom: "0" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Statut de Disponibilité Initial
                       </label>
                       <select
                         value={newUser.availability_status}
                         onChange={(e) => setNewUser({ ...newUser, availability_status: e.target.value })}
                         style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       >
                         <option value="disponible">Disponible</option>
                         <option value="occupé">Occupé</option>
                         <option value="en_pause">En pause</option>
                         <option value="hors_service">Hors service</option>
                       </select>
                       <small style={{ display: "block", marginTop: "4px", color: "#666", fontSize: "12px" }}>
                         Le statut peut être modifié ultérieurement par le technicien ou l'admin
                       </small>
                     </div>
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
                       status: "actif",
                       password: "",
                       confirmPassword: "",
                       generateRandomPassword: true,
                       sendEmail: true,
                       work_hours: "08:30-12:30 / 14:00-17:30",
                       availability_status: "disponible"
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
                       {["Actif", "Inactif"].map((status) => (
                         <label key={status} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                           <input
                             type="radio"
                             name="editStatus"
                             value={status.toLowerCase()}
                             checked={editUser.status === status.toLowerCase()}
                             onChange={(e) => setEditUser({ ...editUser, status: e.target.value })}
                             required
                             style={{ cursor: "pointer" }}
                           />
                           <span>{status}{editUser.status === status.toLowerCase() ? " (Sélectionné)" : ""}</span>
                         </label>
                       ))}
                     </div>
                   </div>
                 </div>
               </div>

               {/* Informations Technicien (conditionnel) */}
               {(editUser.role === "Technicien (Matériel)" || editUser.role === "Technicien (Applicatif)") && (
                 <div style={{ marginBottom: "24px" }}>
                   <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Informations Technicien</h3>
                   <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", borderLeft: "4px solid #17a2b8", background: "#f8f9fa" }}>
                     <div style={{ marginBottom: "16px" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Horaires de Travail
                       </label>
                       <input
                         type="text"
                         value={editUser.work_hours}
                         onChange={(e) => setEditUser({ ...editUser, work_hours: e.target.value })}
                         style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                         placeholder="Ex: 08:30-12:30 / 14:00-17:30"
                       />
                       <small style={{ display: "block", marginTop: "4px", color: "#666", fontSize: "12px" }}>
                         Format recommandé: "08:30-12:30 / 14:00-17:30" ou "9h-18h"
                       </small>
                     </div>
                     <div style={{ marginBottom: "0" }}>
                       <label style={{ display: "block", marginBottom: "8px", color: "#333", fontWeight: "500" }}>
                         Statut de Disponibilité
                       </label>
                       <select
                         value={editUser.availability_status}
                         onChange={(e) => setEditUser({ ...editUser, availability_status: e.target.value })}
                         style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                       >
                         <option value="disponible">Disponible</option>
                         <option value="occupé">Occupé</option>
                         <option value="en_pause">En pause</option>
                         <option value="hors_service">Hors service</option>
                       </select>
                       <small style={{ display: "block", marginTop: "4px", color: "#666", fontSize: "12px" }}>
                         Le statut peut être modifié ultérieurement par le technicien ou l'admin
                       </small>
                     </div>
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
                    <strong>Ticket #{ticket.number}:</strong> {ticket.title}
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
                    const workload = tech.assigned_tickets_count || 0;
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
            <h3 style={{ marginBottom: "16px", color: "#007bff" }}>Assigner le ticket</h3>
            
            {/* Informations du ticket */}
            {(() => {
              const ticket = allTickets.find(t => t.id === assignTicketId);
              return ticket ? (
                <div style={{ marginBottom: "20px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Ticket #{ticket.number}:</strong> {ticket.title}
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
                    const workload = tech.assigned_tickets_count || 0;
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
                onClick={() => assignTicketId && handleAssign(assignTicketId)}
                disabled={loading || !selectedTechnician}
                style={{
                  padding: "10px 20px",
                  background: "#007bff",
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
                    const workload = tech.assigned_tickets_count || 0;
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
    </div>
  );
}

export default DSIDashboard;
