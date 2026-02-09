import { useEffect, useState, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Clock3, Users, CheckCircle2, CheckCircle, ChevronRight, ChevronLeft, ChevronDown, LayoutDashboard, Bell, Search, Clock, Monitor, Wrench, Forward, AlertTriangle, BarChart3, TrendingUp, Box, UserPlus, FileText, UserCheck, RefreshCcw, Filter, Calendar, Layers, Building2, User, FileSpreadsheet, MessageCircle, Flag, Share2, Package, Trash2, DollarSign, Ticket as TicketIcon, Archive, Banknote, Download, Plus, Pencil, X, FolderTree, Tag } from "lucide-react";
import helpdeskLogo from "../assets/helpdesk-logo.png";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  LabelList
} from "recharts";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { fr } from "date-fns/locale";

interface SecretaryDashboardProps {
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
  user_agency: string | null;  // Agence de l'utilisateur créateur
  priority: string;
  status: string;
  type: string;  // "materiel" ou "applicatif"
  category?: string | null;
  technician_id: string | null;
  technician?: {
    full_name: string;
  } | null;
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
  resolved_tickets_count?: number;
  closed_tickets_count?: number;
  avg_resolution_time_days?: number;
  success_rate?: number;
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
}

/** Liste déroulante des filtres (survol orange sur les options) */
function OrangeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);
  const selected = options.find((o) => o.value === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="dsi-orange-select-trigger"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "6px 10px",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          fontSize: "14px",
          height: "36px",
          cursor: "pointer",
          color: "#111827",
        }}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={16} color="#6b7280" />
      </div>
      {open && (
        <div
          className="dsi-orange-select-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 1000,
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`dsi-orange-select-option ${value === opt.value ? "dsi-orange-select-option-selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: "14px",
                backgroundColor: "transparent",
                color: "#111827",
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SecretaryDashboard({ token }: SecretaryDashboardProps) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  
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
  
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [selectedTechnician, setSelectedTechnician] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  const [assignmentPriority, setAssignmentPriority] = useState<string>("moyenne");
  const [activePrioritiesForAssign, setActivePrioritiesForAssign] = useState<Array<{ id: number; code: string; label: string; color_hex?: string | null; display_order: number }>>([]);
  const [reopenTicketId, setReopenTicketId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [loadingRejectionReason, setLoadingRejectionReason] = useState<boolean>(false);
  const [viewTicketDetails, setViewTicketDetails] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Ticket | null>(null);
  const [ticketHistory, setTicketHistory] = useState<TicketHistory[]>([]);
  const [showTicketDetailsPage, setShowTicketDetailsPage] = useState<boolean>(false);
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignModalTicketId, setAssignModalTicketId] = useState<string | null>(null);
  const [showReassignModal, setShowReassignModal] = useState<boolean>(false);
  const [reassignTicketId, setReassignTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleName, setRoleName] = useState<string>("");
  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [delegationFilter, setDelegationFilter] = useState<string>("all");
  // Filtres avancés section Tickets (Adjoint DSI uniquement)
  const [advancedPeriodRange, setAdvancedPeriodRange] = useState<{ from: Date | undefined; to?: Date | undefined } | undefined>(undefined);
  const [showPeriodCalendar, setShowPeriodCalendar] = useState<boolean>(false);
  const periodCalendarRef = useRef<HTMLDivElement>(null);
  const [advancedAgencyFilter, setAdvancedAgencyFilter] = useState<string>("all");
  const [advancedCategoryFilter, setAdvancedCategoryFilter] = useState<string>("all");
  const [advancedTypeFilter, setAdvancedTypeFilter] = useState<string>("all");
  const [advancedNonResolvedFilter, setAdvancedNonResolvedFilter] = useState<string>("all");
  const [advancedUserFilter, setAdvancedUserFilter] = useState<string>("all");
  const [advancedCreatorFilter, setAdvancedCreatorFilter] = useState<string>("");
  const [categoriesList, setCategoriesList] = useState<Array<{ id: number; name: string; description?: string | null; type_code: string; is_active: boolean }>>([]);
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showNotificationsTicketsView, setShowNotificationsTicketsView] = useState<boolean>(false);
  const [notificationsTickets, setNotificationsTickets] = useState<Ticket[]>([]);
  const [selectedNotificationTicket, setSelectedNotificationTicket] = useState<string | null>(null);
  const [selectedNotificationTicketDetails, setSelectedNotificationTicketDetails] = useState<Ticket | null>(null);
  const [selectedNotificationTicketHistory, setSelectedNotificationTicketHistory] = useState<any[]>([]);
  const [userInfo, setUserInfo] = useState<UserRead | null>(null);
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
  // Filtres visuels pour les actifs (Adjoint DSI) – n'affectent pas la logique
  const [assetStatusFilter, setAssetStatusFilter] = useState<string>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>("all");
  const [assetDepartmentFilter, setAssetDepartmentFilter] = useState<string>("all");
  const [showOutputFormat, setShowOutputFormat] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<string>("");
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openActionsMenuFor, setOpenActionsMenuFor] = useState<string | null>(null);
  const [ticketSearchQuery, setTicketSearchQuery] = useState<string>("");
  const [delegatedTicketsByDSI, setDelegatedTicketsByDSI] = useState<Set<string>>(new Set());
  // États pour la section Types (Adjoint DSI) – même contenu que Admin
  const [ticketTypes, setTicketTypes] = useState<Array<{
    id: number;
    code: string;
    label: string;
    is_active: boolean;
    type: string;
    description: string;
    color: string;
  }>>([]);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<number | null>(null);
  const [newType, setNewType] = useState({ type: "", description: "", color: "#007bff", is_active: true });
  const [loadingTypes, setLoadingTypes] = useState(false);
  // États pour la section Catégories (Adjoint DSI) – même contenu que Admin
  const [categoriesTypes, setCategoriesTypes] = useState<Array<{ id: number; code: string; label: string; is_active: boolean }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [expandedCategoryType, setExpandedCategoryType] = useState<string | null>(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryTypeCode, setNewCategoryTypeCode] = useState("");
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string; type_code: string; is_active: boolean } | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryTypeCode, setEditCategoryTypeCode] = useState("");

  // Fonction pour déterminer la section active basée sur l'URL (uniquement pour Adjoint DSI)
  function getActiveSectionFromPath(): string {
    if (roleName !== "Adjoint DSI") {
      return activeSection;
    }
    if (location.pathname === "/dashboard/adjoint/notifications") return "notifications";
    if (location.pathname === "/dashboard/adjoint/statistics") return "reports";
    if (location.pathname === "/dashboard/adjoint/technicians") return "technicians";
    if (location.pathname === "/dashboard/adjoint/actifs") return "actifs";
    if (location.pathname === "/dashboard/adjoint/types") return "types";
    if (location.pathname === "/dashboard/adjoint/categories") return "categories";
    if (location.pathname === "/dashboard/adjoint/tickets") return "tickets";
    if (location.pathname === "/dashboard/adjoint") return "dashboard";
    return activeSection;
  }

  const currentActiveSection = getActiveSectionFromPath();

  // Synchroniser activeSection avec l'URL pour Adjoint DSI
  useEffect(() => {
    if (roleName === "Adjoint DSI") {
      const sectionFromPath = getActiveSectionFromPath();
      setActiveSection(sectionFromPath);
    }
  }, [location.pathname, roleName]);

  // Charger les types de tickets pour la section Types (Adjoint DSI)
  useEffect(() => {
    if (currentActiveSection === "types" && roleName === "Adjoint DSI" && token) {
      let cancelled = false;
      setLoadingTypes(true);
      fetch("http://localhost:8000/ticket-config/types", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : [])
        .then((data) => { if (!cancelled) setTicketTypes(data); })
        .catch(() => { if (!cancelled) setTicketTypes([]); })
        .finally(() => { if (!cancelled) setLoadingTypes(false); });
      return () => { cancelled = true; };
    }
  }, [currentActiveSection, roleName, token]);

  // Charger types et catégories pour la section Catégories (Adjoint DSI)
  useEffect(() => {
    if (currentActiveSection !== "categories" || roleName !== "Adjoint DSI" || !token) return;
    let cancelled = false;
    setLoadingCategories(true);
    Promise.all([
      fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("http://localhost:8000/ticket-config/categories", { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(([typesRes, catRes]) => Promise.all([typesRes.ok ? typesRes.json() : [], catRes.ok ? catRes.json() : []]))
      .then(([typesData, catData]) => {
        if (!cancelled) {
          setCategoriesTypes(typesData);
          setCategoriesList(catData);
        }
      })
      .catch(() => { if (!cancelled) setCategoriesTypes([]); })
      .finally(() => { if (!cancelled) setLoadingCategories(false); });
    return () => { cancelled = true; };
  }, [currentActiveSection, roleName, token]);

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

  // Fonction pour obtenir le libellé d'un statut
  function getStatusLabel(status: string): string {
    switch (status) {
      case "en_attente_analyse": return "En attente d'assignation";
      case "assigne_technicien": return "Assigné";
      case "en_traitement": case "en_cours": return "En traitement";
      case "resolu": return "Résolu";
      case "cloture": return "Clôturé";
      case "rejete": return "Relancé";
      default: return status || "—";
    }
  }

  // Fonction pour obtenir le libellé du type de ticket
  function getTypeLabel(type: string): string {
    if (!type) return "Non spécifié";
    switch (type.toLowerCase()) {
      case "materiel": return "Matériel";
      case "applicatif": return "Applicatif";
      default: return type;
    }
  }

  // Handlers pour la section Types (Adjoint DSI) – même logique que Admin
  const handleAddType = async () => {
    if (!newType.type.trim()) { alert("Veuillez remplir le nom du type"); return; }
    if (!token) { alert("Session expirée. Veuillez vous reconnecter."); return; }
    try {
      const res = await fetch("http://localhost:8000/ticket-config/types", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: newType.type.trim(), is_active: newType.is_active }),
      });
      if (res.ok) {
        const typesRes = await fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } });
        if (typesRes.ok) setTicketTypes(await typesRes.json());
        setNewType({ type: "", description: "", color: "#007bff", is_active: true });
        setShowAddTypeModal(false);
        alert("Type de ticket ajouté avec succès !");
      } else {
        const error = await res.json().catch(() => ({ detail: "Erreur lors de l'ajout" }));
        alert(error.detail || "Erreur lors de l'ajout du type");
      }
    } catch (err) {
      console.error("Erreur lors de l'ajout du type:", err);
      alert("Erreur lors de l'ajout du type");
    }
  };
  const handleEditType = (typeId: number) => {
    const type = ticketTypes.find(t => t.id === typeId);
    if (type) {
      setNewType({ type: type.label, description: "", color: "#007bff", is_active: type.is_active });
      setEditingType(typeId);
      setShowAddTypeModal(true);
    }
  };
  const handleToggleActiveType = () => setNewType({ ...newType, is_active: !newType.is_active });
  const handleUpdateType = async () => {
    if (!newType.type.trim()) { alert("Veuillez remplir le nom du type"); return; }
    if (!editingType || !token) { alert("Erreur: type non sélectionné"); return; }
    try {
      const res = await fetch(`http://localhost:8000/ticket-config/types/${editingType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: newType.type, is_active: newType.is_active }),
      });
      if (res.ok) {
        const typesRes = await fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } });
        if (typesRes.ok) setTicketTypes(await typesRes.json());
        setNewType({ type: "", description: "", color: "#007bff", is_active: true });
        setEditingType(null);
        setShowAddTypeModal(false);
        alert("Type de ticket modifié avec succès !");
      } else {
        const error = await res.json().catch(() => ({ detail: "Erreur lors de la modification" }));
        alert(error.detail || "Erreur lors de la modification du type");
      }
    } catch (err) {
      console.error("Erreur lors de la modification du type:", err);
      alert("Erreur lors de la modification du type");
    }
  };
  const handleDeleteType = async (typeId: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce type de ticket ?")) return;
    if (!token) { alert("Session expirée. Veuillez vous reconnecter."); return; }
    try {
      const res = await fetch(`http://localhost:8000/ticket-config/types/${typeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const typesRes = await fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } });
        if (typesRes.ok) setTicketTypes(await typesRes.json());
        alert("Type de ticket supprimé avec succès !");
      } else {
        const error = await res.json().catch(() => ({ detail: "Erreur lors de la suppression" }));
        alert(error.detail || "Erreur lors de la suppression du type");
      }
    } catch (err) {
      console.error("Erreur lors de la suppression du type:", err);
      alert("Erreur lors de la suppression du type");
    }
  };

  // Handlers pour la section Catégories (Adjoint DSI)
  async function handleAddCategory() {
    if (!token?.trim()) { alert("Session expirée. Veuillez vous reconnecter."); return; }
    const name = newCategoryName?.trim();
    if (!name) { alert("Le nom de la catégorie est obligatoire."); return; }
    const selectedType = categoriesTypes.find((t) => t.code === newCategoryTypeCode);
    if (!selectedType) { alert("Veuillez sélectionner un type de ticket."); return; }
    try {
      const res = await fetch("http://localhost:8000/ticket-config/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, ticket_type_id: selectedType.id, is_active: true }),
      });
      if (res.ok) {
        const [typesRes, categoriesRes] = await Promise.all([
          fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("http://localhost:8000/ticket-config/categories", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (typesRes.ok) setCategoriesTypes(await typesRes.json());
        if (categoriesRes.ok) setCategoriesList(await categoriesRes.json());
        setShowAddCategoryModal(false);
        setNewCategoryName("");
        setNewCategoryTypeCode(categoriesTypes[0]?.code ?? "");
      } else {
        const err = await res.json().catch(() => ({ detail: "Erreur lors de l'ajout" }));
        alert(err.detail || "Erreur lors de l'ajout de la catégorie");
      }
    } catch (err) {
      console.error("Erreur lors de l'ajout de la catégorie:", err);
      alert("Erreur lors de l'ajout de la catégorie");
    }
  }
  async function handleUpdateCategory() {
    if (!editingCategory || !token?.trim()) { if (!token?.trim()) alert("Session expirée. Veuillez vous reconnecter."); return; }
    const name = editCategoryName?.trim();
    if (!name) { alert("Le nom de la catégorie est obligatoire."); return; }
    const selectedType = categoriesTypes.find((t) => t.code === editCategoryTypeCode);
    if (!selectedType) { alert("Veuillez sélectionner un type de ticket."); return; }
    try {
      const res = await fetch(`http://localhost:8000/ticket-config/categories/${editingCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, ticket_type_id: selectedType.id, is_active: editingCategory.is_active }),
      });
      if (res.ok) {
        const [typesRes, categoriesRes] = await Promise.all([
          fetch("http://localhost:8000/ticket-config/types", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("http://localhost:8000/ticket-config/categories", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (typesRes.ok) setCategoriesTypes(await typesRes.json());
        if (categoriesRes.ok) setCategoriesList(await categoriesRes.json());
        setShowEditCategoryModal(false);
        setEditingCategory(null);
      } else {
        const err = await res.json().catch(() => ({ detail: "Erreur lors de la modification" }));
        alert(err.detail || "Erreur lors de la modification de la catégorie");
      }
    } catch (err) {
      console.error("Erreur lors de la modification de la catégorie:", err);
      alert("Erreur lors de la modification de la catégorie");
    }
  }

  // Fonction helper pour déterminer l'icône et les couleurs de la timeline d'historique
  const getHistoryVisuals = (entry: TicketHistory) => {
    const status = (entry.new_status || "").toLowerCase();
    const oldStatus = (entry.old_status || "").toLowerCase();
    const reason = (entry.reason || "").toLowerCase();

    let Icon = Clock;
    let iconBg = "#F3F4F6";
    let iconBorder = "#E5E7EB";
    let iconColor = "#111827";

    if (reason.startsWith("commentaire:") || reason.startsWith("commentaire :")) {
      Icon = MessageCircle;
      iconBg = "#EFF6FF";
      iconBorder = "#BFDBFE";
      iconColor = "#1D4ED8";
      return { Icon, iconBg, iconBorder, iconColor };
    }
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
      entry.old_status &&
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

  // Formate la date/heure pour l'historique (ex. "25 janv. 2026 à 10:36")
  const formatHistoryDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    const day = d.toLocaleDateString("fr-FR", { day: "2-digit" });
    const month = d.toLocaleDateString("fr-FR", { month: "short" });
    const year = d.toLocaleDateString("fr-FR", { year: "numeric" });
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${day} ${month} ${year} à ${time}`;
  };

  // Fonction helper pour déterminer le titre principal d'une entrée d'historique
  const getHistoryTitle = (entry: TicketHistory, ticket?: Ticket | null, allHistory?: TicketHistory[]): string => {
    if (!entry.old_status) {
      return "Création du ticket";
    }
    const reason = (entry.reason || "").toLowerCase();
    if (reason.startsWith("commentaire:") || reason.startsWith("commentaire :")) {
      return "Commentaire ajouté";
    }
    const oldStatus = (entry.old_status || "").toLowerCase();
    const newStatus = (entry.new_status || "").toLowerCase();
    
    // Cas spécifique: délégation à l'Adjoint DSI (en_attente_analyse → en_attente_analyse avec "Délégation au Adjoint DSI")
    if ((oldStatus.includes("en_attente_analyse") || oldStatus.includes("en attente analyse")) &&
        (newStatus.includes("en_attente_analyse") || newStatus.includes("en attente analyse")) &&
        (reason.includes("délégation") || reason.includes("délégu") || reason.includes("delegat"))) {
      // Vérifier si l'utilisateur connecté est l'Adjoint DSI auquel le ticket a été délégué
      const ticketAny = ticket as any;
      if (ticketAny && ticketAny.secretary_id && userInfo && userInfo.id) {
        if (String(ticketAny.secretary_id) === String(userInfo.id)) {
          // Si le ticket a été délégué à l'utilisateur connecté (Adjoint DSI), utiliser son nom
          return `Ticket Délégué à ${userInfo.full_name}`;
        }
      }
      
      // Essayer d'obtenir le nom de l'Adjoint depuis le ticket (secretary_id)
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
      const match = reasonUpper.match(/(?:au|à)\s+(?:Adjoint\s+DSI\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      if (match && match[1] && match[1] !== "Adjoint" && match[1] !== "DSI") {
        return `Ticket Délégué à ${match[1]}`;
      }
      
      // Si pas de nom trouvé, utiliser "Adjoint DSI" par défaut
      return "Ticket Délégué à Adjoint DSI";
    }
    
    // Cas spécifique: assignation (en_attente_analyse → assigne_technicien)
    if ((oldStatus.includes("en_attente_analyse") || oldStatus.includes("en attente analyse")) &&
        (newStatus.includes("assigne_technicien") || newStatus.includes("assigne technicien") || newStatus.includes("assigné technicien"))) {
      // Si le ticket a un technicien assigné, afficher son nom
      if (ticket && ticket.technician && ticket.technician.full_name) {
        return `Assigné à ${ticket.technician.full_name}`;
      }
      return "Assigné à technicien";
    }
    
    // Cas spécifique: technicien prend en charge (assigne_technicien → en_cours)
    if ((oldStatus.includes("assigne_technicien") || oldStatus.includes("assigne technicien") || oldStatus.includes("assigné technicien")) &&
        (newStatus.includes("en_cours") || newStatus.includes("en cours"))) {
      return "Ticket en cours de traitement";
    }
    
    // Cas spécifique: rejet de résolution par l'utilisateur (resolu → rejete avec "Validation utilisateur: Rejeté")
    if ((oldStatus.includes("resolu") || oldStatus.includes("résolu")) &&
        (newStatus.includes("rejete") || newStatus.includes("rejeté")) &&
        (reason.includes("validation utilisateur: rejeté") || reason.includes("validation utilisateur: rejeté"))) {
      return "Ticket relancé";
    }
    
    // Cas spécifique: reprise du ticket après relance (rejete → en_cours)
    if ((oldStatus.includes("rejete") || oldStatus.includes("rejeté")) &&
        (newStatus.includes("en_cours") || newStatus.includes("en cours"))) {
      return "Ticket repris en charge par le technicien";
    }
    
    // Cas spécifique: technicien résout le ticket (en_cours → resolu)
    if ((oldStatus.includes("en_cours") || oldStatus.includes("en cours")) &&
        (newStatus.includes("resolu") || newStatus.includes("résolu"))) {
      // Afficher "Résolu par [nom du technicien]" si disponible
      if (entry.user && entry.user.full_name) {
        return `Résolu par ${entry.user.full_name}`;
      }
      return "Résolu par technicien";
    }
    
    // Cas spécifique: validation et clôture par l'utilisateur (resolu → cloture avec "Validation utilisateur: Validé")
    if ((oldStatus.includes("resolu") || oldStatus.includes("résolu")) &&
        (newStatus.includes("cloture") || newStatus.includes("clôture")) &&
        (reason.includes("validation utilisateur: validé") || reason.includes("validation utilisateur: validé"))) {
      // Afficher "Validé par [nom de l'utilisateur]" si disponible
      if (entry.user && entry.user.full_name) {
        return `Validé par ${entry.user.full_name}`;
      }
      return "Validé par utilisateur";
    }
    
    // Format par défaut: "ancien → nouveau"
    return `${entry.old_status} → ${entry.new_status}`;
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
      changed_at: ticket.created_at || "",
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

  // Fonction pour charger les rapports récents
  async function loadRecentReports() {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      // Pour l'instant, on simule des rapports basés sur les tickets
      // Plus tard, on pourra appeler une vraie API /reports/recent
      const reports = [
        {
          id: "1",
          name: "Performance Janvier 2024",
          generated_by: userInfo?.full_name || "Admin",
          date: new Date().toLocaleDateString("fr-FR"),
          type: "performance"
        },
        {
          id: "2",
          name: "Tickets par Département",
          generated_by: "DSI",
          date: new Date(Date.now() - 86400000).toLocaleDateString("fr-FR"),
          type: "tickets_department"
        },
        {
          id: "3",
          name: "Satisfaction Utilisateurs",
          generated_by: userInfo?.full_name || "Admin",
          date: new Date(Date.now() - 172800000).toLocaleDateString("fr-FR"),
          type: "satisfaction"
        }
      ];
      setRecentReports(reports);
    } catch (err) {
      console.error("Erreur lors du chargement des rapports récents:", err);
    }
  }

  async function loadNotifications() {
    if (!token || token.trim() === "") {
      return;
    }
    
    try {
      const res = await fetch("http://localhost:8000/notifications/?unread_only=true", {
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

  async function markTicketNotificationsAsRead(ticketId: string) {
    const unreadForTicket = notifications.filter((n) => n.ticket_id === ticketId && !n.read);
    if (unreadForTicket.length === 0 || !token || token.trim() === "") return;
    try {
      await Promise.all(
        unreadForTicket.map((n) =>
          fetch(`http://localhost:8000/notifications/${n.id}/read`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
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
    if (!token || token.trim() === "") return;
    try {
      const res = await fetch("http://localhost:8000/notifications/read-all", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
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
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        setAllTickets(ticketsData);
      }
    } catch (err) {
      console.error("Erreur lors du chargement des tickets:", err);
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        // Charger tous les tickets
        await loadTickets();

        // Charger la liste des techniciens
        const techRes = await fetch("http://localhost:8000/users/technicians", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (techRes.ok) {
          const techData = await techRes.json();
          setTechnicians(techData);
        }

        // Charger les priorités actives pour le formulaire d'assignation (Adjoint DSI)
        try {
          const prioritiesRes = await fetch("http://localhost:8000/ticket-config/priorities", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (prioritiesRes.ok) {
            const prioritiesData = await prioritiesRes.json();
            setActivePrioritiesForAssign(prioritiesData);
          }
        } catch (err) {
          console.error("Erreur chargement priorités:", err);
        }

        // Charger les informations de l'utilisateur connecté (pour connaître le rôle)
        const meRes = await fetch("http://localhost:8000/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData && meData.role && typeof meData.role.name === "string") {
            setRoleName(meData.role.name);
          }
          setUserInfo({
            id: meData.id,
            full_name: meData.full_name,
            email: meData.email,
            agency: meData.agency,
            role: meData.role
          });
        }

        // Charger les notifications
        await loadNotifications();
        await loadUnreadCount();
      } catch (err) {
        console.error("Erreur chargement données:", err);
      }
    }
    void loadData();

    // Recharger automatiquement les tickets et notifications toutes les 30 secondes
    // Cela permet aux métriques de se mettre à jour automatiquement avec les données réelles
    const interval = setInterval(() => {
      void loadTickets(ticketSearchQuery); // Rafraîchir les tickets pour mettre à jour les métriques automatiquement
      void loadNotifications();
      void loadUnreadCount();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [token, ticketSearchQuery]);

  // Identifier les tickets délégués par le DSI
  // Un ticket est délégué par le DSI si :
  // 1. Le ticket a secretary_id === userInfo.id (délégué à cet Adjoint DSI)
  // 2. ET il y a une entrée dans l'historique créée par le DSI (pas l'Adjoint DSI) qui délègue le ticket
  // Cela permet de distinguer les délégations du DSI des assignations par l'Adjoint DSI
  useEffect(() => {
    async function identifyDelegatedTickets() {
      if (roleName !== "Adjoint DSI" || !userInfo?.id) {
        setDelegatedTicketsByDSI(new Set());
        return;
      }

      if (allTickets.length === 0) {
        setDelegatedTicketsByDSI(new Set());
        return;
      }

      const delegatedTicketsSet = new Set<string>();
      const adjointIdStr = String(userInfo.id);
      
      // Filtrer les tickets qui ont un secretary_id correspondant à l'Adjoint DSI connecté
      const ticketsWithSecretaryId = allTickets.filter(
        (t) => t.secretary_id === userInfo.id
      );

      // Vérifier l'historique de chaque ticket pour confirmer qu'il a été délégué par le DSI
      for (const ticket of ticketsWithSecretaryId) {
        try {
          const historyRes = await fetch(
            `http://localhost:8000/tickets/${ticket.id}/history`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          
          if (historyRes.ok) {
            const history: TicketHistory[] = await historyRes.json();

            // Chercher une entrée d'historique qui indique une délégation par le DSI
            // Critères STRICTS pour une délégation du DSI :
            // 1. L'entrée a été créée par quelqu'un d'autre que l'Adjoint DSI (donc le DSI)
            // 2. La raison DOIT contenir des mots-clés de délégation ("Délégation", "délégué")
            // 3. Le statut passe à "en_attente_analyse" (pour confirmer)
            // 4. Ce n'est PAS une assignation
            // IMPORTANT : On exige que la raison contienne des mots-clés de délégation pour éviter
            // les faux positifs (comme les tickets créés initialement avec statut "en_attente_analyse")
            const delegationEntry = history.find((h: TicketHistory) => {
              const reason = h.reason || "";
              const reasonLower = reason.toLowerCase();
              
              // L'entrée doit avoir été créée par quelqu'un d'autre que l'Adjoint DSI connecté
              // (donc par le DSI)
              const createdByDSI = String(h.user_id) !== adjointIdStr;
              
              if (!createdByDSI) {
                return false; // Si c'est l'Adjoint DSI qui a créé l'entrée, ce n'est pas une délégation
              }
              
              // Vérifier que ce n'est PAS une assignation
              // Les assignations passent le statut à "assigne_technicien"
              const isAssignment = 
                h.new_status === "assigne_technicien" ||
                reasonLower.includes("assignation") || 
                reasonLower.includes("assigné") ||
                reasonLower.includes("assigner") ||
                reasonLower.includes("assignation par");
              
              if (isAssignment) {
                return false; // Si c'est une assignation, ce n'est pas une délégation
              }
              
              // CRITÈRE PRINCIPAL : La raison DOIT contenir des mots-clés de délégation
              // C'est le seul moyen fiable de distinguer une délégation d'une création de ticket
              const hasDelegationKeywords =
                reasonLower.includes("délégation") ||
                reasonLower.includes("délégué") ||
                reasonLower.includes("délégation au adjoint dsi") ||
                reasonLower.includes("délégué par dsi");
              
              if (!hasDelegationKeywords) {
                return false; // Sans mots-clés de délégation, ce n'est pas une délégation
              }
              
              // Le statut doit passer à "en_attente_analyse" (c'est le cas lors d'une délégation)
              const statusChangedToPending = 
                h.new_status === "en_attente_analyse";
              
              // C'est une délégation si :
              // - La raison contient des mots-clés de délégation (OBLIGATOIRE)
              // - ET le statut passe à "en_attente_analyse" (pour confirmer)
              // - ET ce n'est pas une assignation
              // - ET l'entrée a été créée par le DSI (pas l'Adjoint DSI)
              return hasDelegationKeywords && statusChangedToPending;
            });

            if (delegationEntry) {
              delegatedTicketsSet.add(ticket.id);
            }
          }
        } catch (err) {
          console.error(
            `Erreur lors de la vérification de l'historique du ticket ${ticket.id}:`,
            err
          );
        }
      }

      setDelegatedTicketsByDSI(delegatedTicketsSet);
      console.log(`Tickets délégués par DSI à l'Adjoint DSI (${userInfo.id}): ${delegatedTicketsSet.size} tickets`);
    }

    void identifyDelegatedTickets();
  }, [allTickets, roleName, userInfo?.id, token]);

  // Debounce pour la recherche de tickets
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadTickets(ticketSearchQuery);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [ticketSearchQuery, token]);

  // Charger les catégories pour l'Adjoint DSI (filtre Catégorie en section Tickets)
  useEffect(() => {
    if (roleName !== "Adjoint DSI") return;
    if (location.pathname !== "/dashboard/adjoint/tickets") return;
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("http://localhost:8000/ticket-config/categories", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setCategoriesList((await res.json()) || []);
      } catch (e) { console.error("Erreur chargement catégories (Adjoint DSI):", e); }
    })();
  }, [roleName, location.pathname, token]);

  // Fermer le Popover Période au clic extérieur (Adjoint DSI)
  useEffect(() => {
    if (!showPeriodCalendar) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (periodCalendarRef.current && !periodCalendarRef.current.contains(e.target as Node)) {
        setShowPeriodCalendar(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPeriodCalendar]);

  // Gérer les paramètres URL pour ouvrir automatiquement les modals
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    const action = searchParams.get("action");
    
    if (ticketId && allTickets.length > 0) {
      // Vérifier que le ticket existe
      const ticket = allTickets.find(t => t.id === ticketId);
      if (ticket) {
        if (action === "assign") {
          setAssignModalTicketId(ticketId);
          setShowAssignModal(true);
          // Nettoyer l'URL après avoir ouvert le modal
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    }
  }, [searchParams, allTickets]);

  // Initialiser la priorité d'assignation à l'ouverture du modal (Adjoint DSI)
  useEffect(() => {
    if (showAssignModal && assignModalTicketId && allTickets.length > 0) {
      const ticket = allTickets.find((t) => t.id === assignModalTicketId);
      const activeCodes = activePrioritiesForAssign.map((p) => p.code);
      const defaultPriority = activePrioritiesForAssign.length > 0 ? activePrioritiesForAssign[0].code : "moyenne";
      setAssignmentPriority(ticket?.priority && activeCodes.includes(ticket.priority) ? ticket.priority : defaultPriority);
    }
  }, [showAssignModal, assignModalTicketId, allTickets]);

  // Charger les rapports récents quand userInfo est disponible
  useEffect(() => {
    if (userInfo) {
      loadRecentReports();
    }
  }, [userInfo]);

  // Debug: vérifier l'état de showGenerateReport
  useEffect(() => {
    if (showGenerateReport) {
      console.log("✅ showGenerateReport est maintenant TRUE - Le formulaire devrait s'afficher");
      console.log("showOutputFormat:", showOutputFormat);
    }
  }, [showGenerateReport, showOutputFormat]);

  // Fermer le menu des actions quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openActionsMenuFor) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-actions-menu]') && !target.closest('button[title="Actions"]')) {
          setOpenActionsMenuFor(null);
        }
      }
    };

    if (openActionsMenuFor) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [openActionsMenuFor]);

  // Fonction pour filtrer les techniciens selon le type du ticket
  function getFilteredTechnicians(ticketType: string): Technician[] {
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
    // Tickets délégués par le DSI (pour l'Adjoint DSI)
    const delegue = allTickets.filter(t => delegatedTicketsByDSI.has(t.id)).length;
    
    // Tickets en cours (excluant les délégués)
    const enCours = allTickets.filter(t => 
      (t.status === "en_cours" || t.status === "assigne_technicien") && 
      !delegatedTicketsByDSI.has(t.id)
    ).length;
    
    // Tickets ouverts (excluant les délégués)
    const ouvert = allTickets.filter(t => 
      (t.status === "ouvert" || t.status === "en_attente_analyse") && 
      !delegatedTicketsByDSI.has(t.id)
    ).length;
    
    // Tickets relancés (excluant les délégués)
    const relance = allTickets.filter(t => 
      t.status === "rejete" && 
      !delegatedTicketsByDSI.has(t.id)
    ).length;
    
    // Tickets résolus (excluant les délégués)
    const resolu = allTickets.filter(t => 
      t.status === "resolu" && 
      !delegatedTicketsByDSI.has(t.id)
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
      doc.setFontSize(12);
      doc.text(`Généré par: ${userInfo?.full_name || 'Utilisateur'}`, 14, 30);
      if (userInfo?.agency) {
        doc.text(`Agence: ${userInfo.agency}`, 14, 40);
      }
      
      // Utiliser exactement les mêmes données que l'affichage (adjoint)
      const problemsToUse = getRecurringTicketsHistory();
      const mostFrequentToUse = getMostFrequentProblems();
      const agenciesStats = Array.from(
        new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean))
      )
        .map((agency) => ({
          agency,
          count: allTickets.filter(
            (t) => (t.creator?.agency || t.user_agency) === agency
          ).length,
        }))
        .sort((a, b) => b.count - a.count);
      
      let startY = userInfo?.agency ? 50 : 40;
      
      if (problemsToUse.length > 0) {
        doc.setFontSize(14);
        doc.text("Historique des problèmes", 14, startY + 5);
        
        const tableData = problemsToUse.map(item => [
          item.titre || "",
          item.occurrences.toString(),
          item.dernier ? new Date(item.dernier).toLocaleDateString('fr-FR') : 'N/A'
        ]);
        
        autoTable(doc, {
          startY: startY + 10,
          head: [['Problème', 'Occurrences', 'Dernière occurrence']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 95] },
        });
      }
      
      // Si aucune donnée pertinente n'est disponible pour l'adjoint
      if (problemsToUse.length === 0 && mostFrequentToUse.length === 0 && agenciesStats.length === 0) {
        doc.setFontSize(12);
        doc.text("Aucune donnée disponible.", 14, startY + 10);
      }
      
      if (mostFrequentToUse.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || startY + 10;
        doc.setFontSize(14);
        doc.text("Problèmes les plus fréquents", 14, finalY + 15);
        
        const tableData2 = mostFrequentToUse.map(item => [
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

      if (agenciesStats.length > 0) {
        const finalY2 = (doc as any).lastAutoTable?.finalY || startY + 10;
        doc.setFontSize(14);
        doc.text("Agences avec le plus de tickets", 14, finalY2 + 15);

        const agencyTable = agenciesStats.map((item) => [
          item.agency,
          item.count.toString(),
        ]);

        autoTable(doc, {
          startY: finalY2 + 20,
          head: [["Agence", "Nombre de tickets"]],
          body: agencyTable,
          theme: "grid",
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
      // Utiliser exactement les mêmes données que l'affichage (adjoint)
      const problemsToUse = getRecurringTicketsHistory();
      const mostFrequentToUse = getMostFrequentProblems();
      const agenciesStats = Array.from(
        new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean))
      )
        .map((agency) => ({
          agency,
          count: allTickets.filter(
            (t) => (t.creator?.agency || t.user_agency) === agency
          ).length,
        }))
        .sort((a, b) => b.count - a.count);
      
      const wb = XLSX.utils.book_new();
      let hasSheets = false;
      
      // Feuille 1: Historique des problèmes
      if (problemsToUse.length > 0) {
        const wsData = [
          ['Problème', 'Occurrences', 'Dernière occurrence'],
          ...problemsToUse.map(item => [
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
      if (mostFrequentToUse.length > 0) {
        const wsData2 = [
          ['Problème', 'Occurrences'],
          ...mostFrequentToUse.map(item => [
            item.problème || "",
            item.occurrences
          ])
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(wsData2);
        XLSX.utils.book_append_sheet(wb, ws2, sanitizeSheetName("Problèmes fréquents"));
        hasSheets = true;
      }
      
      // Feuille 3: Agences avec le plus de tickets
      if (agenciesStats.length > 0) {
        const agencySheetData = [
          ['Agences avec le plus de tickets'],
          ['Agence', 'Nombre de tickets'],
          ...agenciesStats.map(item => [item.agency, item.count])
        ];
        const ws4 = XLSX.utils.aoa_to_sheet(agencySheetData);
        XLSX.utils.book_append_sheet(wb, ws4, sanitizeSheetName("Agences"));
        hasSheets = true;
      }
      
      // Si aucune feuille n'a été créée, créer une feuille par défaut
      if (!hasSheets) {
        const defaultData = [
          ['Rapport', reportType],
          ['Date de génération', new Date().toLocaleDateString('fr-FR')],
          ['Généré par', userInfo?.full_name || 'Utilisateur'],
          [''],
          ['Aucune donnée disponible.']
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
      "evolutions": "Évolutions dans le temps",
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
      } else {
        const doc = new jsPDF();

        // En-tête commun
        doc.setFontSize(16);
        doc.text(`Rapport: ${reportName}`, 14, 20);
        doc.setFontSize(12);
        doc.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, 14, 30);
        doc.text(`Généré par: ${userInfo?.full_name || "Utilisateur"}`, 14, 40);

        if (selectedReport === "statistiques") {
          // Export détaillé pour Statistiques générales (adjoint)
          const totalTickets = allTickets.length || 1;
          const closedCount = allTickets.filter((t) => t.status === "cloture").length;
          const rejectedCount = allTickets.filter((t) => t.status === "rejete").length;

          let currentY = 50;
          doc.setFontSize(14);
          doc.text("Répartition par statut", 14, currentY);

          const statusTableData = [
            [
              "En attente",
              pendingTickets.length.toString(),
              `${totalTickets > 0 ? ((pendingTickets.length / totalTickets) * 100).toFixed(1) : "0"}%`,
            ],
            [
              "Assignés/En cours",
              assignedTickets.length.toString(),
              `${totalTickets > 0 ? ((assignedTickets.length / totalTickets) * 100).toFixed(1) : "0"}%`,
            ],
            [
              "Résolus",
              resolvedCount.toString(),
              `${totalTickets > 0 ? ((resolvedCount / totalTickets) * 100).toFixed(1) : "0"}%`,
            ],
            [
              "Clôturés",
              closedCount.toString(),
              `${totalTickets > 0 ? ((closedCount / totalTickets) * 100).toFixed(1) : "0"}%`,
            ],
            [
              "Rejetés",
              rejectedCount.toString(),
              `${totalTickets > 0 ? ((rejectedCount / totalTickets) * 100).toFixed(1) : "0"}%`,
            ],
          ];

          autoTable(doc, {
            startY: currentY + 5,
            head: [["Statut", "Nombre", "Pourcentage"]],
            body: statusTableData,
            theme: "grid",
            headStyles: { fillColor: [30, 58, 95] },
          });

          const afterStatusY = (doc as any).lastAutoTable?.finalY || currentY + 25;
          const priorities: Array<"critique" | "haute" | "moyenne" | "faible"> = [
            "critique",
            "haute",
            "moyenne",
            "faible",
          ];

          doc.setFontSize(14);
          doc.text("Répartition par priorité", 14, afterStatusY + 10);

          const priorityTableData = priorities.map((priority) => {
            const count = allTickets.filter((t) => t.priority === priority).length;
            const label = priority.charAt(0).toUpperCase() + priority.slice(1);
            const percent =
              totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(1) : "0";
            return [label, count.toString(), `${percent}%`];
          });

          autoTable(doc, {
            startY: afterStatusY + 15,
            head: [["Priorité", "Nombre", "Pourcentage"]],
            body: priorityTableData,
            theme: "grid",
            headStyles: { fillColor: [30, 58, 95] },
          });

          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        } else if (selectedReport === "metriques") {
          // Export détaillé pour Métriques de performance (adjoint)
          // Calculer les métriques
          const resolvedTickets = allTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
          const rejectedTickets = allTickets.filter((t) => t.status === "rejete");
          const escalatedTickets = allTickets.filter((t) => t.priority === "critique" && (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours"));
          const allRejectedTicketIds = new Set(rejectedTickets.map(t => t.id));
          const reopenedTickets = allTickets.filter((t) => allRejectedTicketIds.has(t.id) && t.status !== "rejete");
          const totalRejectedEver = rejectedTickets.length + reopenedTickets.length;
          const reopenRate = totalRejectedEver > 0 ? ((reopenedTickets.length / totalRejectedEver) * 100).toFixed(1) : "0.0";
          
          let totalResolutionTime = 0;
          let resolvedCountWithDates = 0;
          resolvedTickets.forEach((ticket) => {
            if (ticket.created_at) {
              let resolvedDate: Date | null = null;
              if (ticket.status === "cloture" && ticket.closed_at) {
                resolvedDate = new Date(ticket.closed_at);
              } else if (ticket.status === "resolu" && ticket.resolved_at) {
                resolvedDate = new Date(ticket.resolved_at);
              }
              if (resolvedDate) {
                const created = new Date(ticket.created_at);
                const diffDays = Math.floor((resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0) {
                  totalResolutionTime += diffDays;
                  resolvedCountWithDates++;
                }
              }
            }
          });
          const avgResolutionDays = resolvedCountWithDates > 0 ? Math.round(totalResolutionTime / resolvedCountWithDates) : 0;
          
          const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined && t.feedback_score > 0);
          let satisfactionRate = "0";
          if (ticketsWithFeedback.length > 0) {
            const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
            satisfactionRate = ((avgFeedback / 5) * 100).toFixed(1);
          } else if (resolvedTickets.length > 0) {
            const resolvedCount = resolvedTickets.length;
            const rejectedCount = rejectedTickets.length;
            const baseDenominator = resolvedCount + rejectedCount;
            satisfactionRate = baseDenominator > 0 ? ((resolvedCount / baseDenominator) * 100).toFixed(1) : "0";
          }
          
          const totalTicketsCount = allTickets.length;
          const resolvedOrClosedCount = resolvedTickets.length;
          const resolutionRate = totalTicketsCount > 0 ? `${Math.round((resolvedOrClosedCount / totalTicketsCount) * 100)}%` : "0%";
          
          let yPos = 55;
          doc.setFontSize(14);
          doc.text("Métriques principales", 14, yPos);
          yPos += 10;
          
          const metricsData = [
            ["Métrique", "Valeur"],
            ["Temps moyen de résolution", `${avgResolutionDays} jours`],
            ["Taux de satisfaction utilisateur", `${satisfactionRate}%`],
            ["Taux de résolution", resolutionRate],
            ["Taux de réouverture", `${reopenRate}%`],
            ["Tickets escaladés", escalatedTickets.length.toString()]
          ];
          
          autoTable(doc, {
            startY: yPos,
            head: [metricsData[0]],
            body: metricsData.slice(1),
            theme: 'grid',
            headStyles: { fillColor: [30, 58, 95] },
          });
          
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 20;
          yPos = finalY + 15;
          
          doc.setFontSize(14);
          doc.text("Détails", 14, yPos);
          yPos += 10;
          
          const detailsData = [
            ["Métrique", "Valeur"],
            ["Tickets résolus/clôturés", resolvedTickets.length.toString()],
            ["Tickets rejetés", rejectedTickets.length.toString()],
            ["Tickets escaladés (critiques en cours)", escalatedTickets.length.toString()],
            ["Tickets satisfaisants (implicite)", resolvedTickets.length.toString()]
          ];
          
          autoTable(doc, {
            startY: yPos,
            head: [detailsData[0]],
            body: detailsData.slice(1),
            theme: 'grid',
            headStyles: { fillColor: [30, 58, 95] },
          });
          
          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        } else if (selectedReport === "agence") {
          // Export détaillé pour Analyses par agence (adjoint)
          let yPos = 55;

          // Préparer les données des agences (même logique que l'affichage)
          const agencies = Array.from(
            new Set(
              allTickets
                .map((t) => t.creator?.agency || t.user_agency)
                .filter(Boolean)
            )
          );

          const agencyData = agencies
            .map((agency) => {
              const agencyTickets = allTickets.filter(
                (t) => (t.creator?.agency || t.user_agency) === agency
              );
              const agencyResolvedTickets = agencyTickets.filter(
                (t) => t.status === "resolu" || t.status === "cloture"
              );
              const agencyRejected = agencyTickets.filter(
                (t) => t.status === "rejete"
              ).length;

              // Calcul du temps moyen de résolution réel pour l'agence
              let totalResolutionTime = 0;
              let resolvedCountWithDates = 0;
              agencyResolvedTickets.forEach((ticket) => {
                if (ticket.created_at) {
                  let resolvedDate: Date | null = null;
                  if (ticket.status === "cloture" && ticket.closed_at) {
                    resolvedDate = new Date(ticket.closed_at);
                  } else if (ticket.status === "resolu" && ticket.resolved_at) {
                    resolvedDate = new Date(ticket.resolved_at);
                  }
                  if (resolvedDate) {
                    const created = new Date(ticket.created_at);
                    const diffDays =
                      (resolvedDate.getTime() - created.getTime()) /
                      (1000 * 60 * 60 * 24);
                    if (diffDays >= 0) {
                      totalResolutionTime += diffDays;
                      resolvedCountWithDates++;
                    }
                  }
                }
              });

              const avgResolutionDays =
                resolvedCountWithDates > 0
                  ? totalResolutionTime / resolvedCountWithDates
                  : 0;
              const avgResolutionDisplay =
                resolvedCountWithDates > 0
                  ? avgResolutionDays % 1 === 0
                    ? `${Math.round(avgResolutionDays)} jour${
                        Math.round(avgResolutionDays) > 1 ? "s" : ""
                      }`
                    : `${avgResolutionDays.toFixed(1)} jours`
                  : "N/A";

              // Calcul de la satisfaction
              const ticketsWithFeedback = agencyResolvedTickets.filter(
                (t) =>
                  t.feedback_score !== null &&
                  t.feedback_score !== undefined
              );
              let satisfactionDisplay = "N/A";

              if (ticketsWithFeedback.length > 0) {
                const avgFeedback =
                  ticketsWithFeedback.reduce(
                    (sum, t) => sum + (t.feedback_score || 0),
                    0
                  ) / ticketsWithFeedback.length;
                satisfactionDisplay = `${(
                  (avgFeedback / 5) *
                  100
                ).toFixed(1)}%`;
              } else if (agencyResolvedTickets.length > 0) {
                const resolvedCount = agencyResolvedTickets.length;
                const rejectedCount = agencyRejected;
                const totalProcessed = resolvedCount + rejectedCount;
                if (totalProcessed > 0) {
                  const satisfactionRate =
                    (resolvedCount / totalProcessed) * 100;
                  satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
                }
              }

              return {
                agence: agency,
                nombreTickets: agencyTickets.length,
                tempsMoyen: avgResolutionDisplay,
                satisfaction: satisfactionDisplay,
              };
            })
            .sort((a, b) => b.nombreTickets - a.nombreTickets);

          doc.setFontSize(14);
          doc.text("Volume de tickets par agence", 14, yPos);
          yPos += 10;
          doc.setFontSize(11);

          const agencyTableData = [
            ["Agence", "Nombre de tickets", "Temps moyen", "Satisfaction"],
          ];

          agencyData.forEach((agency) => {
            agencyTableData.push([
              agency.agence || '',
              agency.nombreTickets.toString(),
              agency.tempsMoyen,
              agency.satisfaction,
            ]);
          });

          autoTable(doc, {
            startY: yPos,
            head: [agencyTableData[0]],
            body: agencyTableData.slice(1),
            theme: "grid",
            headStyles: { fillColor: [30, 58, 95] },
          });

          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        } else if (selectedReport === "technicien") {
          // Export détaillé pour Analyses par technicien (adjoint)
          let yPos = 55;

          // Préparer les données des techniciens (similaire à l'export DSI)
          const technicianData = technicians.map((tech) => {
            const techTickets = allTickets.filter(
              (t) => t.technician_id === tech.id
            );
            const inProgress = techTickets.filter(
              (t) =>
                t.status === "assigne_technicien" || t.status === "en_cours"
            ).length;
            const resolvedTickets = techTickets.filter(
              (t) => t.status === "resolu" || t.status === "cloture"
            );

            // Temps moyen de résolution (heures / jours)
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
                  } else if (
                    ticket.status === "resolu" &&
                    ticket.resolved_at
                  ) {
                    resolvedDate = new Date(ticket.resolved_at);
                  }

                  if (resolvedDate) {
                    const diffHours =
                      (resolvedDate.getTime() - created.getTime()) /
                      (1000 * 60 * 60);
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

            // Satisfaction (même logique que le tableau affiché : basée sur résolus vs rejetés)
            const techResolved = resolvedTickets.length;
            const techRejected = techTickets.filter(
              (t) => t.status === "rejete"
            ).length;
            const techDenominator = techResolved + techRejected;
            const techSatisfaction =
              techDenominator > 0
                ? ((techResolved / techDenominator) * 100).toFixed(1) + "%"
                : "0%";

            return {
              technicien: tech.full_name,
              ticketsTraites: techResolved,
              tempsMoyen: avgTimeDisplay,
              chargeActuelle: inProgress,
              satisfaction: techSatisfaction,
            };
          });

          doc.setFontSize(14);
          doc.text("Performance des techniciens", 14, yPos);
          yPos += 10;
          doc.setFontSize(11);

          const techTableData = [
            [
              "Technicien",
              "Tickets traités",
              "Temps moyen",
              "Charge actuelle",
              "Satisfaction",
            ],
          ];

          technicianData.forEach((t) => {
            techTableData.push([
              t.technicien,
              t.ticketsTraites.toString(),
              t.tempsMoyen,
              t.chargeActuelle.toString(),
              t.satisfaction,
            ]);
          });

          autoTable(doc, {
            startY: yPos,
            head: [techTableData[0]],
            body: techTableData.slice(1),
            theme: "grid",
            headStyles: { fillColor: [30, 58, 95] },
          });

          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        } else if (selectedReport === "evolutions") {
          // Export détaillé pour Évolutions dans le temps (adjoint)
          let yPos = 55;

          // Recalculer exactement les mêmes données que l'affichage
          const now = new Date();
          const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const lastMonthStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

          const ticketsThisWeek = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastWeek;
          });

          const ticketsThisMonth = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastMonth;
          });

          const ticketsLastMonth = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastMonthStart && createdDate < lastMonth;
          });

          const trendThisWeek = ticketsThisWeek.length;
          const trendLastMonth = ticketsLastMonth.length;
          const trendChange =
            trendLastMonth > 0
              ? (((trendThisWeek - trendLastMonth) / trendLastMonth) * 100).toFixed(1)
              : "0";

          const ticketsByDay: { [key: string]: number } = {};
          allTickets.forEach((t: any) => {
            const date = new Date(t.created_at);
            const dayName = date.toLocaleDateString("fr-FR", { weekday: "long" });
            ticketsByDay[dayName] = (ticketsByDay[dayName] || 0) + 1;
          });

          const busiestDay = Object.entries(ticketsByDay).reduce(
            (a, b) => (ticketsByDay[a[0]] > ticketsByDay[b[0]] ? a : b),
            ["", 0] as [string, number]
          );

          // 1) Indicateurs principaux
          doc.setFontSize(14);
          doc.text("Indicateurs principaux", 14, yPos);
          yPos += 8;
          doc.setFontSize(11);

          const kpiTable = [
            ["Ticket cette semaine", ticketsThisWeek.length.toString()],
            ["Tickets ce mois", ticketsThisMonth.length.toString()],
            ["Tendance (%)", `${parseFloat(trendChange).toFixed(1)}%`],
          ];

          autoTable(doc, {
            startY: yPos,
            head: [["Indicateur", "Valeur"]],
            body: kpiTable,
            theme: "grid",
            headStyles: { fillColor: [30, 58, 95] },
          });

          yPos = (doc as any).lastAutoTable?.finalY || yPos + 25;

          // 2) Répartition par jour de la semaine
          doc.setFontSize(14);
          doc.text("Répartition par jour de la semaine", 14, yPos + 10);
          yPos += 20;
          doc.setFontSize(11);

          const dayTableData = Object.entries(ticketsByDay)
            .sort((a, b) => b[1] - a[1])
            .map(([day, count]) => [day, count.toString()]);

          autoTable(doc, {
            startY: yPos,
            head: [["Jour", "Nombre de tickets"]],
            body: dayTableData,
            theme: "grid",
            headStyles: { fillColor: [23, 162, 184] },
          });

          yPos = (doc as any).lastAutoTable?.finalY || yPos + 20;

          // 3) Pics d'activité
          doc.setFontSize(14);
          doc.text("Pics d'activité", 14, yPos + 10);
          yPos += 18;
          doc.setFontSize(11);

          const busiestText =
            busiestDay[0] && busiestDay[1]
              ? `${busiestDay[0]} (${busiestDay[1]} tickets)`
              : "Aucune donnée";
          doc.text(`Jour le plus chargé : ${busiestText}`, 14, yPos);
          yPos += 12;

          // 4) Performance par période
          doc.setFontSize(14);
          doc.text("Performance par période", 14, yPos + 8);
          yPos += 18;
          doc.setFontSize(11);

          const performanceTable = [
            [
              "Cette semaine",
              ticketsThisWeek.length.toString(),
              ticketsThisWeek
                .filter(
                  (t: any) => t.status === "resolu" || t.status === "cloture"
                )
                .length.toString(),
            ],
            [
              "Ce mois",
              ticketsThisMonth.length.toString(),
              ticketsThisMonth
                .filter(
                  (t: any) => t.status === "resolu" || t.status === "cloture"
                )
                .length.toString(),
            ],
            [
              "Mois dernier",
              ticketsLastMonth.length.toString(),
              ticketsLastMonth
                .filter(
                  (t: any) => t.status === "resolu" || t.status === "cloture"
                )
                .length.toString(),
            ],
          ];

          autoTable(doc, {
            startY: yPos,
            head: [["Période", "Tickets créés", "Tickets résolus"]],
            body: performanceTable,
            theme: "grid",
            headStyles: { fillColor: [40, 167, 69] },
          });

          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        } else {
          // Export générique pour les autres rapports
          doc.save(
            `Rapport_${reportName.replace(/\s+/g, "_")}_${new Date()
              .toISOString()
              .split("T")[0]}.pdf`
          );
        }
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
      } else {
        const wb = XLSX.utils.book_new();

        if (selectedReport === "statistiques") {
          // Export détaillé pour Statistiques générales (adjoint)
          const totalTickets = allTickets.length || 1;
          const closedCount = allTickets.filter((t) => t.status === "cloture").length;
          const rejectedCount = allTickets.filter((t) => t.status === "rejete").length;

          // Feuille récapitulative
          const summaryData = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Nombre total de tickets", allTickets.length],
            ["Tickets résolus/clôturés", resolvedCount + closedCount],
          ];
          const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
          XLSX.utils.book_append_sheet(
            wb,
            wsSummary,
            sanitizeSheetName("Résumé")
          );

          // Feuille Répartition par statut
          const statusSheetData = [
            ["Statut", "Nombre", "Pourcentage"],
            [
              "En attente",
              pendingTickets.length,
              totalTickets > 0
                ? ((pendingTickets.length / totalTickets) * 100).toFixed(1) + "%"
                : "0%",
            ],
            [
              "Assignés/En cours",
              assignedTickets.length,
              totalTickets > 0
                ? ((assignedTickets.length / totalTickets) * 100).toFixed(1) + "%"
                : "0%",
            ],
            [
              "Résolus",
              resolvedCount,
              totalTickets > 0
                ? ((resolvedCount / totalTickets) * 100).toFixed(1) + "%"
                : "0%",
            ],
            [
              "Clôturés",
              closedCount,
              totalTickets > 0
                ? ((closedCount / totalTickets) * 100).toFixed(1) + "%"
                : "0%",
            ],
            [
              "Rejetés",
              rejectedCount,
              totalTickets > 0
                ? ((rejectedCount / totalTickets) * 100).toFixed(1) + "%"
                : "0%",
            ],
          ];
          const wsStatus = XLSX.utils.aoa_to_sheet(statusSheetData);
          XLSX.utils.book_append_sheet(
            wb,
            wsStatus,
            sanitizeSheetName("Statuts")
          );

          // Feuille Répartition par priorité
          const priorities: Array<"critique" | "haute" | "moyenne" | "faible"> = [
            "critique",
            "haute",
            "moyenne",
            "faible",
          ];
          const prioritySheetData: any[][] = [
            ["Priorité", "Nombre", "Pourcentage"],
          ];
          priorities.forEach((priority) => {
            const count = allTickets.filter((t) => t.priority === priority).length;
            const label = priority.charAt(0).toUpperCase() + priority.slice(1);
            const percent =
              totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(1) + "%" : "0%";
            prioritySheetData.push([label, count, percent]);
          });
          const wsPriority = XLSX.utils.aoa_to_sheet(prioritySheetData);
          XLSX.utils.book_append_sheet(
            wb,
            wsPriority,
            sanitizeSheetName("Priorités")
          );
        } else if (selectedReport === "metriques") {
          // Export détaillé pour Métriques de performance (adjoint)
          // Calculer les métriques
          const resolvedTickets = allTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
          const rejectedTickets = allTickets.filter((t) => t.status === "rejete");
          const escalatedTickets = allTickets.filter((t) => t.priority === "critique" && (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours"));
          const allRejectedTicketIds = new Set(rejectedTickets.map(t => t.id));
          const reopenedTickets = allTickets.filter((t) => allRejectedTicketIds.has(t.id) && t.status !== "rejete");
          const totalRejectedEver = rejectedTickets.length + reopenedTickets.length;
          const reopenRate = totalRejectedEver > 0 ? ((reopenedTickets.length / totalRejectedEver) * 100).toFixed(1) : "0.0";
          
          let totalResolutionTime = 0;
          let resolvedCountWithDates = 0;
          resolvedTickets.forEach((ticket) => {
            if (ticket.created_at) {
              let resolvedDate: Date | null = null;
              if (ticket.status === "cloture" && ticket.closed_at) {
                resolvedDate = new Date(ticket.closed_at);
              } else if (ticket.status === "resolu" && ticket.resolved_at) {
                resolvedDate = new Date(ticket.resolved_at);
              }
              if (resolvedDate) {
                const created = new Date(ticket.created_at);
                const diffDays = Math.floor((resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0) {
                  totalResolutionTime += diffDays;
                  resolvedCountWithDates++;
                }
              }
            }
          });
          const avgResolutionDays = resolvedCountWithDates > 0 ? Math.round(totalResolutionTime / resolvedCountWithDates) : 0;
          
          const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined && t.feedback_score > 0);
          let satisfactionRate = "0";
          if (ticketsWithFeedback.length > 0) {
            const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
            satisfactionRate = ((avgFeedback / 5) * 100).toFixed(1);
          } else if (resolvedTickets.length > 0) {
            const resolvedCount = resolvedTickets.length;
            const rejectedCount = rejectedTickets.length;
            const baseDenominator = resolvedCount + rejectedCount;
            satisfactionRate = baseDenominator > 0 ? ((resolvedCount / baseDenominator) * 100).toFixed(1) : "0";
          }
          
          const totalTicketsCount = allTickets.length;
          const resolvedOrClosedCount = resolvedTickets.length;
          const resolutionRate = totalTicketsCount > 0 ? `${Math.round((resolvedOrClosedCount / totalTicketsCount) * 100)}%` : "0%";
          
          // Feuille récapitulative
          const summaryData = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Métriques principales", ""],
            ["Temps moyen de résolution", `${avgResolutionDays} jours`],
            ["Taux de satisfaction utilisateur", `${satisfactionRate}%`],
            ["Taux de résolution", resolutionRate],
            ["Taux de réouverture", `${reopenRate}%`],
            ["Tickets escaladés", escalatedTickets.length],
          ];
          const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
          XLSX.utils.book_append_sheet(
            wb,
            wsSummary,
            sanitizeSheetName("Résumé")
          );
          
          // Feuille Détails
          const detailsData = [
            ["Métrique", "Valeur"],
            ["Tickets résolus/clôturés", resolvedTickets.length],
            ["Tickets rejetés", rejectedTickets.length],
            ["Tickets escaladés (critiques en cours)", escalatedTickets.length],
            ["Tickets satisfaisants (implicite)", resolvedTickets.length],
          ];
          const wsDetails = XLSX.utils.aoa_to_sheet(detailsData);
          XLSX.utils.book_append_sheet(
            wb,
            wsDetails,
            sanitizeSheetName("Détails")
          );
        } else if (selectedReport === "agence") {
          // Export détaillé pour Analyses par agence (adjoint)
          const agencies = Array.from(
            new Set(
              allTickets
                .map((t) => t.creator?.agency || t.user_agency)
                .filter(Boolean)
            )
          );

          const agencyData = agencies
            .map((agency) => {
              const agencyTickets = allTickets.filter(
                (t) => (t.creator?.agency || t.user_agency) === agency
              );
              const resolvedAgencyTickets = agencyTickets.filter(
                (t) => t.status === "resolu" || t.status === "cloture"
              );

              // Calculer le temps moyen de résolution (uniquement avec dates réelles)
              let totalResolutionTime = 0;
              let countWithDates = 0;

              resolvedAgencyTickets.forEach((ticket) => {
                if (ticket.created_at && (ticket.resolved_at || ticket.closed_at)) {
                  const created = new Date(ticket.created_at);
                  const resolved = ticket.resolved_at
                    ? new Date(ticket.resolved_at)
                    : new Date(ticket.closed_at!);
                  const diffTime = resolved.getTime() - created.getTime();
                  const diffDays = diffTime / (1000 * 60 * 60 * 24);
                  if (diffDays >= 0) {
                    totalResolutionTime += diffDays;
                    countWithDates++;
                  }
                }
              });

              const avgResolutionDays =
                countWithDates > 0 ? totalResolutionTime / countWithDates : 0;
              const avgResolutionDisplay =
                countWithDates > 0
                  ? avgResolutionDays % 1 === 0
                    ? `${Math.round(avgResolutionDays)} jour${
                        Math.round(avgResolutionDays) > 1 ? "s" : ""
                      }`
                    : `${avgResolutionDays.toFixed(1)} jours`
                  : "N/A";

              // Calculer la satisfaction
              const ticketsWithFeedback = resolvedAgencyTickets.filter(
                (t) =>
                  t.feedback_score !== null &&
                  t.feedback_score !== undefined
              );
              let satisfactionDisplay = "N/A";

              if (ticketsWithFeedback.length > 0) {
                const avgFeedback =
                  ticketsWithFeedback.reduce(
                    (sum, t) => sum + (t.feedback_score || 0),
                    0
                  ) / ticketsWithFeedback.length;
                satisfactionDisplay = `${(
                  (avgFeedback / 5) *
                  100
                ).toFixed(1)}%`;
              } else if (resolvedAgencyTickets.length > 0) {
                const rejectedAgencyTickets = agencyTickets.filter(
                  (t) => t.status === "rejete"
                );
                const resolvedCount = resolvedAgencyTickets.length;
                const rejectedCount = rejectedAgencyTickets.length;
                const totalProcessed = resolvedCount + rejectedCount;
                if (totalProcessed > 0) {
                  const satisfactionRate =
                    (resolvedCount / totalProcessed) * 100;
                  satisfactionDisplay = `${satisfactionRate.toFixed(1)}%`;
                }
              }

              return {
                agence: agency,
                nombreTickets: agencyTickets.length,
                tempsMoyen: avgResolutionDisplay,
                satisfaction: satisfactionDisplay,
              };
            })
            .sort((a, b) => b.nombreTickets - a.nombreTickets);

          const agencyTableData = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Volume de tickets par agence"],
            ["Agence", "Nombre de tickets", "Temps moyen", "Satisfaction"],
          ];

          agencyData.forEach((agency) => {
            agencyTableData.push([
              agency.agence || '',
              agency.nombreTickets.toString(),
              agency.tempsMoyen,
              agency.satisfaction,
            ]);
          });

          const agencyWs = XLSX.utils.aoa_to_sheet(agencyTableData);
          XLSX.utils.book_append_sheet(
            wb,
            agencyWs,
            sanitizeSheetName("Par agence")
          );
        } else if (selectedReport === "technicien") {
          // Export détaillé pour Analyses par technicien (adjoint)
          const technicianData = technicians.map((tech) => {
            const techTickets = allTickets.filter(
              (t) => t.technician_id === tech.id
            );
            const inProgress = techTickets.filter(
              (t) =>
                t.status === "assigne_technicien" || t.status === "en_cours"
            ).length;
            const resolvedTickets = techTickets.filter(
              (t) => t.status === "resolu" || t.status === "cloture"
            );

            // Temps moyen de résolution (heures / jours)
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
                  } else if (
                    ticket.status === "resolu" &&
                    ticket.resolved_at
                  ) {
                    resolvedDate = new Date(ticket.resolved_at);
                  }

                  if (resolvedDate) {
                    const diffHours =
                      (resolvedDate.getTime() - created.getTime()) /
                      (1000 * 60 * 60);
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

            // Satisfaction (même logique que le tableau affiché : basée sur résolus vs rejetés)
            const techResolved = resolvedTickets.length;
            const techRejected = techTickets.filter(
              (t) => t.status === "rejete"
            ).length;
            const techDenominator = techResolved + techRejected;
            const techSatisfaction =
              techDenominator > 0
                ? ((techResolved / techDenominator) * 100).toFixed(1) + "%"
                : "0%";

            return {
              technicien: tech.full_name,
              ticketsTraites: techResolved,
              tempsMoyen: avgTimeDisplay,
              chargeActuelle: inProgress,
              satisfaction: techSatisfaction,
            };
          });

          const techSheetData: any[][] = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Performance des techniciens"],
            [
              "Technicien",
              "Tickets traités",
              "Temps moyen",
              "Charge actuelle",
              "Satisfaction",
            ],
          ];

          technicianData.forEach((t) => {
            techSheetData.push([
              t.technicien,
              t.ticketsTraites,
              t.tempsMoyen,
              t.chargeActuelle,
              t.satisfaction,
            ]);
          });

          const techWs = XLSX.utils.aoa_to_sheet(techSheetData);
          XLSX.utils.book_append_sheet(
            wb,
            techWs,
            sanitizeSheetName("Par technicien")
          );
        } else if (selectedReport === "evolutions") {
          // Export détaillé pour Évolutions dans le temps (adjoint)
          const now = new Date();
          const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const lastMonthStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

          const ticketsThisWeek = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastWeek;
          });

          const ticketsThisMonth = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastMonth;
          });

          const ticketsLastMonth = allTickets.filter((t: any) => {
            const createdDate = new Date(t.created_at);
            return createdDate >= lastMonthStart && createdDate < lastMonth;
          });

          const trendThisWeek = ticketsThisWeek.length;
          const trendLastMonth = ticketsLastMonth.length;
          const trendChange =
            trendLastMonth > 0
              ? (((trendThisWeek - trendLastMonth) / trendLastMonth) * 100).toFixed(1)
              : "0";

          const ticketsByDay: { [key: string]: number } = {};
          allTickets.forEach((t: any) => {
            const date = new Date(t.created_at);
            const dayName = date.toLocaleDateString("fr-FR", { weekday: "long" });
            ticketsByDay[dayName] = (ticketsByDay[dayName] || 0) + 1;
          });

          const busiestDay = Object.entries(ticketsByDay).reduce(
            (a, b) => (ticketsByDay[a[0]] > ticketsByDay[b[0]] ? a : b),
            ["", 0] as [string, number]
          );

          // Feuille 1: Indicateurs + performance
          const summarySheetData: any[][] = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Indicateurs principaux", ""],
            ["Tickets cette semaine", ticketsThisWeek.length],
            ["Tickets ce mois", ticketsThisMonth.length],
            ["Tendance (%)", `${parseFloat(trendChange).toFixed(1)}%`],
            [""],
            ["Performance par période", ""],
            ["Période", "Tickets créés", "Tickets résolus"],
            [
              "Cette semaine",
              ticketsThisWeek.length,
              ticketsThisWeek.filter(
                (t: any) => t.status === "resolu" || t.status === "cloture"
              ).length,
            ],
            [
              "Ce mois",
              ticketsThisMonth.length,
              ticketsThisMonth.filter(
                (t: any) => t.status === "resolu" || t.status === "cloture"
              ).length,
            ],
            [
              "Mois dernier",
              ticketsLastMonth.length,
              ticketsLastMonth.filter(
                (t: any) => t.status === "resolu" || t.status === "cloture"
              ).length,
            ],
            [""],
            ["Pics d'activité", ""],
            [
              "Jour le plus chargé",
              busiestDay[0]
                ? `${busiestDay[0]} (${busiestDay[1]} tickets)`
                : "Aucune donnée",
            ],
          ];
          const summaryWs = XLSX.utils.aoa_to_sheet(summarySheetData);
          XLSX.utils.book_append_sheet(
            wb,
            summaryWs,
            sanitizeSheetName("Résumé")
          );

          // Feuille 2: Répartition par jour de la semaine
          const dayTableData: any[][] = [
            ["Répartition par jour de la semaine"],
            ["Jour", "Nombre de tickets"],
          ];
          Object.entries(ticketsByDay)
            .sort((a, b) => b[1] - a[1])
            .forEach(([day, count]) => {
              dayTableData.push([day, count]);
            });
          const dayWs = XLSX.utils.aoa_to_sheet(dayTableData);
          XLSX.utils.book_append_sheet(
            wb,
            dayWs,
            sanitizeSheetName("Jours semaine")
          );
        } else {
          // Export générique pour les autres rapports
          const wsData = [
            ["Rapport", reportName],
            ["Date de génération", new Date().toLocaleDateString("fr-FR")],
            ["Généré par", userInfo?.full_name || "Utilisateur"],
            [""],
            ["Note: Les données détaillées seront disponibles dans une prochaine version."],
          ];
          const ws = XLSX.utils.aoa_to_sheet(wsData);
          XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName("Rapport"));
        }

        // Vérifier que le workbook n'est pas vide avant d'écrire
        if (wb.SheetNames.length === 0) {
          throw new Error("Le classeur Excel est vide");
        }
        
        const fileName = `Rapport_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
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
      }
    } catch (error) {
      console.error("Erreur lors de l'export Excel:", error);
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      alert(`Erreur lors de l'export Excel: ${errorMessage}`);
    }
  };

  // Fonction générique pour voir le rapport détaillé
  const viewDetailedReport = (reportType?: string) => {
    const reportName = getReportName(reportType);
    if (selectedReport === "recurrents") {
      // Utiliser exactement les mêmes données que l'affichage (adjoint)
      const problemsToUse = getRecurringTicketsHistory();
      const mostFrequentToUse = getMostFrequentProblems();
      const agenciesStats = Array.from(
        new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean))
      )
        .map((agency) => ({
          agency,
          count: allTickets.filter(
            (t) => (t.creator?.agency || t.user_agency) === agency
          ).length,
        }))
        .sort((a, b) => b.count - a.count);
      
      let reportContent = `RAPPORT: ${reportName}\n`;
      reportContent += `Date de génération: ${new Date().toLocaleDateString('fr-FR')}\n`;
      reportContent += `Date de génération (heure): ${new Date().toLocaleTimeString('fr-FR')}\n\n`;
      
      reportContent += "=".repeat(80) + "\n";
      reportContent += "HISTORIQUE DES PROBLÈMES\n";
      reportContent += "=".repeat(80) + "\n\n";
      
      if (problemsToUse.length > 0) {
        problemsToUse.forEach((item, index) => {
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
      
      if (mostFrequentToUse.length > 0) {
        mostFrequentToUse.forEach((item, index) => {
          reportContent += `${index + 1}. ${item.problème}\n`;
          reportContent += `   Occurrences: ${item.occurrences}\n\n`;
        });
      } else {
        reportContent += "Aucun problème fréquent identifié.\n\n";
      }

      reportContent += "=".repeat(80) + "\n";
      reportContent += "AGENCES AVEC LE PLUS DE TICKETS\n";
      reportContent += "=".repeat(80) + "\n\n";

      if (agenciesStats.length > 0) {
        agenciesStats.forEach((item, index) => {
          reportContent += `${index + 1}. ${item.agency}\n`;
          reportContent += `   Nombre de tickets: ${item.count}\n\n`;
        });
      } else {
        reportContent += "Aucune agence trouvée.\n\n";
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
          reason: "Assignation par Secrétaire/Adjoint DSI",
          notes: assignmentNotes || undefined,
          priority: assignmentPriority,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setAllTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
        void (async () => {
          try {
            const ticketsRes = await fetch("http://localhost:8000/tickets/", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (ticketsRes.ok) {
              const ticketsData = await ticketsRes.json();
              setAllTickets(ticketsData);
            }
          } catch {}
        })();
        setSelectedTicket(null);
        setSelectedTechnician("");
        setAssignmentNotes("");
        setAssignmentPriority(activePrioritiesForAssign.length > 0 ? activePrioritiesForAssign[0].code : "moyenne");
        setShowAssignModal(false);
        setAssignModalTicketId(null);
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
    if (roleName === "Adjoint DSI") {
      navigate("/dashboard/adjoint/notifications");
    } else {
      setActiveSection("notifications");
    }
    setSelectedNotificationTicket(notification.ticket_id);
    
    // Charger les tickets avec notifications
    await loadNotificationsTickets();
  }

  // Charger les tickets avec notifications quand la vue s'ouvre
  useEffect(() => {
    if ((currentActiveSection === "notifications" || showNotificationsTicketsView) && notifications.length > 0) {
      void loadNotificationsTickets();
    }
  }, [activeSection, location.pathname, roleName, showNotificationsTicketsView, notifications.length]);

  // Scroller vers le haut quand le panneau de notifications s'ouvre
  useEffect(() => {
    if (showNotificationsTicketsView) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [showNotificationsTicketsView]);

  // Charger automatiquement les détails du ticket sélectionné dans la section notifications
  useEffect(() => {
    if (currentActiveSection === "notifications" && selectedNotificationTicket) {
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
  }, [activeSection, location.pathname, roleName, selectedNotificationTicket, token]);

  function handleReassignClick(ticketId: string) {
    setReassignTicketId(ticketId);
    setSelectedTechnician("");
    setAssignmentNotes("");
    setShowReassignModal(true);
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
          reason: "Réassignation par Adjoint DSI",
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
        setSelectedTicket(null);
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

  const pendingCount = pendingTickets.length;
  const assignedCount = assignedTickets.length;
  const resolvedCount = resolvedTickets.length;

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
  
  // Filtre par délégation (UNIQUEMENT pour l'adjoint DSI)
  // Utiliser delegatedTicketsByDSI pour vérifier les tickets réellement délégués par le DSI
  if (roleName === "Adjoint DSI" && delegationFilter !== "all") {
    if (delegationFilter === "delegated") {
      filteredTickets = filteredTickets.filter((t) => delegatedTicketsByDSI.has(t.id));
    } else if (delegationFilter === "not_delegated") {
      filteredTickets = filteredTickets.filter((t) => !delegatedTicketsByDSI.has(t.id));
    }
  }

  // Récupérer toutes les agences uniques
  const allAgencies = Array.from(new Set(
    allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)
  ));

  // Données pour filtres avancés (Adjoint DSI)
  const advancedCategories = Array.from(new Set(categoriesList.filter((c) => c.is_active).map((c) => c.name)));
  const advancedTypes = Array.from(new Set(allTickets.map((t) => t.type).filter(Boolean)));
  const advancedUsers = Array.from(new Set([...allTickets.map((t) => t.creator?.full_name).filter(Boolean), ...allTickets.map((t) => t.technician?.full_name).filter(Boolean)]));

  // Appliquer les filtres avancés (Adjoint DSI uniquement, sans toucher aux 4 filtres existants)
  if (roleName === "Adjoint DSI") {
    if (advancedPeriodRange?.from !== undefined) {
      const fromStart = new Date(advancedPeriodRange.from);
      fromStart.setHours(0, 0, 0, 0);
      filteredTickets = filteredTickets.filter((t) => {
        if (!t.created_at) return false;
        const created = new Date(t.created_at).getTime();
        if (created < fromStart.getTime()) return false;
        if (advancedPeriodRange.to !== undefined) {
          const toEnd = new Date(advancedPeriodRange.to);
          toEnd.setHours(23, 59, 59, 999);
          return created <= toEnd.getTime();
        }
        return true;
      });
    } else if (advancedPeriodRange?.to !== undefined) {
      const toEnd = new Date(advancedPeriodRange.to);
      toEnd.setHours(23, 59, 59, 999);
      filteredTickets = filteredTickets.filter((t) => {
        if (!t.created_at) return false;
        return new Date(t.created_at).getTime() <= toEnd.getTime();
      });
    }
    if (advancedAgencyFilter !== "all") filteredTickets = filteredTickets.filter((t) => (t.creator?.agency || t.user_agency) === advancedAgencyFilter);
    if (advancedCategoryFilter !== "all") filteredTickets = filteredTickets.filter((t) => t.category === advancedCategoryFilter);
    if (advancedTypeFilter !== "all") filteredTickets = filteredTickets.filter((t) => t.type === advancedTypeFilter);
    if (advancedNonResolvedFilter !== "all") {
      const days = parseInt(advancedNonResolvedFilter, 10);
      if (!Number.isNaN(days) && days > 0) {
        const now = Date.now();
        filteredTickets = filteredTickets.filter((t) => {
          if (t.resolved_at) return false;
          if (!t.created_at) return true;
          return (now - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24) >= days;
        });
      }
    }
    if (advancedUserFilter !== "all") filteredTickets = filteredTickets.filter((t) => (t.technician?.full_name || "") === advancedUserFilter || (t.creator?.full_name || "") === advancedUserFilter);
    if (advancedCreatorFilter.trim()) filteredTickets = filteredTickets.filter((t) => (t.creator?.full_name || "").toLowerCase().includes(advancedCreatorFilter.trim().toLowerCase()));
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: "#f5f5f5", overflowX: "visible" }}>
      {/* Sidebar */}
      <style>{`
        .sidebar-custom::-webkit-scrollbar {
          display: none;
        }
        .sidebar-custom {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div className="sidebar-custom" style={{ 
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: sidebarCollapsed ? "80px" : "250px", 
        background: "hsl(226, 34%, 15%)", 
        color: "white", 
        padding: "20px",
        paddingTop: "20px",
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
          marginTop: "0px",
          paddingBottom: "8px",
          paddingTop: "0px",
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
                : "S"}
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
                {userInfo.role?.name || roleName || "Secrétaire DSI"}
              </div>
            </div>
          </div>
        )}
        
        <div 
          onClick={() => {
            if (roleName === "Adjoint DSI") {
              navigate("/dashboard/adjoint");
            } else {
              setActiveSection("dashboard");
            }
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "dashboard" ? "hsl(25, 95%, 53%)" : "transparent", 
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={18} color={currentActiveSection === "dashboard" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tableau de Bord</div>
        </div>
        
        <div 
          onClick={() => {
            if (roleName === "Adjoint DSI") {
              setStatusFilter("all");
              navigate("/dashboard/adjoint/tickets");
            } else {
              setStatusFilter("all");
              setActiveSection("tickets");
            }
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "tickets" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={currentActiveSection === "tickets" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="4" rx="1" />
              <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="16" y2="14" />
              <line x1="8" y1="18" x2="12" y2="18" />
            </svg>
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Tickets</div>
        </div>
        
        {roleName === "Adjoint DSI" && (
        <div 
          onClick={() => navigate("/dashboard/adjoint/types")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "types" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={18} color={currentActiveSection === "types" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Types</div>
        </div>
        )}
        {roleName === "Adjoint DSI" && (
        <div 
          onClick={() => navigate("/dashboard/adjoint/categories")}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "categories" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FolderTree size={18} color={currentActiveSection === "categories" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Catégories</div>
        </div>
        )}
        {roleName === "Adjoint DSI" && (
        <div 
          onClick={() => {
            navigate("/dashboard/adjoint/actifs");
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "actifs" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Box size={18} color={currentActiveSection === "actifs" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Actifs</div>
        </div>
        )}
        
        <div 
          onClick={() => {
            if (roleName === "Adjoint DSI") {
              navigate("/dashboard/adjoint/technicians");
            } else {
              setActiveSection("technicians");
            }
          }}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            padding: "10px", 
            background: currentActiveSection === "technicians" ? "hsl(25, 95%, 53%)" : "transparent",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wrench size={18} color={currentActiveSection === "technicians" ? "white" : "rgba(180, 180, 180, 0.7)"} />
          </div>
          <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Techniciens</div>
        </div>
        
        {(roleName === "Adjoint DSI" || roleName === "DSI" || roleName === "Admin") && (
          <div 
            onClick={() => {
              if (roleName === "Adjoint DSI") {
                navigate("/dashboard/adjoint/statistics");
              } else {
                setActiveSection("reports");
              }
            }}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px", 
              padding: "10px", 
              background: currentActiveSection === "reports" ? "hsl(25, 95%, 53%)" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              marginBottom: "8px"
            }}
          >
            <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart3 size={20} color={currentActiveSection === "reports" ? "white" : "rgba(180, 180, 180, 0.7)"} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: "16px", fontFamily: "'Inter', system-ui, sans-serif", fontWeight: "500" }}>Statistiques</div>
          </div>
        )}

        {/* Section Notifications + Déconnexion en bas */}
        <div style={{ marginTop: "auto" }}>
          {/* Trait de séparation (même style qu'au-dessus de Tableau de bord) */}
          <div style={{
            height: "1px",
            background: "rgba(255, 255, 255, 0.1)",
            margin: "0 12px 8px 12px"
          }} />
          {/* Bouton Notifications */}
          <div
            onClick={() => {
              if (roleName === "Adjoint DSI") {
                navigate("/dashboard/adjoint/notifications");
              } else {
                setActiveSection("notifications");
              }
            }}
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
              {currentActiveSection === "actifs" ? "Gestion des Actifs" : currentActiveSection === "types" ? "Types" : currentActiveSection === "categories" ? "Catégories" : "Tableau de bord"}
            </div>
            <div style={{ 
              fontSize: "13px", 
              fontWeight: "400",
              color: "#6b7280",
              fontFamily: "system-ui, -apple-system, sans-serif"
            }}>
              {currentActiveSection === "actifs"
                ? "Gérez l'inventaire des équipements informatiques"
                : currentActiveSection === "types"
                ? "Types de tickets (Matériel / Applicatif)"
                : currentActiveSection === "categories"
                ? "Gérez les catégories par type de ticket"
                : "Vue d'ensemble de votre activité"}
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

        {/* Section Notifications dans le contenu principal */}
        {currentActiveSection === "notifications" && (
          <div style={{
            display: "flex",
            width: "100%",
            height: "calc(100vh - 80px)",
            background: "white",
            overflow: "hidden",
            marginTop: "80px"
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
                padding: "28px 20px 20px 30px",
                borderBottom: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "white",
                borderRadius: "8px 0 0 0",
                flexShrink: 0
              }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>
                  Tickets avec notifications
                </h3>
                <button
                  onClick={() => {
                    if (roleName === "Adjoint DSI") {
                      navigate("/dashboard/adjoint");
                    } else {
                      setActiveSection("dashboard");
                    }
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
                overflowX: "hidden",
                padding: "10px 10px 10px 0",
                minHeight: 0
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
                              await markTicketNotificationsAsRead(ticket.id);
                            }
                          } catch (err) {
                            console.error("Erreur chargement détails:", err);
                          }
                        }}
                        style={{
                          padding: "12px 12px 12px 30px",
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
              background: "white",
              position: "relative",
              height: "100%",
              maxHeight: "100%"
            }}>
              {selectedNotificationTicketDetails ? (
                <>
                  <div style={{
                    padding: "28px 20px 20px 20px",
                    borderBottom: "1px solid #e0e0e0",
                    background: "white",
                    borderRadius: "0 8px 0 0",
                    flexShrink: 0
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
                    overflowX: "hidden",
                    padding: "20px",
                    minHeight: 0
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
                          background: selectedNotificationTicketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "critique" ? "#E53E3E" : selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : selectedNotificationTicketDetails.priority === "moyenne" ? "#0DADDB" : "white"
                        }}>
                          {getPriorityLabel(selectedNotificationTicketDetails.priority)}
                        </span>
                      </div>
                      <div>
                        <strong>Type :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                          {getTypeLabel(selectedNotificationTicketDetails.type)}
                        </span>
                      </div>
                      <div>
                        <strong>Catégorie :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.category || "Non spécifiée"}
                        </span>
                      </div>
                      <div>
                        <strong>Statut :</strong>
                        <span style={{
                          marginLeft: "8px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "500",
                          background: selectedNotificationTicketDetails.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : selectedNotificationTicketDetails.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : (selectedNotificationTicketDetails.status === "en_traitement" || selectedNotificationTicketDetails.status === "en_cours") ? "rgba(15, 31, 61, 0.1)" : selectedNotificationTicketDetails.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : selectedNotificationTicketDetails.status === "rejete" ? "#fee2e2" : selectedNotificationTicketDetails.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                          color: selectedNotificationTicketDetails.status === "en_attente_analyse" ? "#0DADDB" : selectedNotificationTicketDetails.status === "assigne_technicien" ? "#FF7A1B" : (selectedNotificationTicketDetails.status === "en_traitement" || selectedNotificationTicketDetails.status === "en_cours") ? "#0F1F3D" : selectedNotificationTicketDetails.status === "resolu" ? "#2F9E44" : selectedNotificationTicketDetails.status === "rejete" ? "#991b1b" : selectedNotificationTicketDetails.status === "cloture" ? "#374151" : "#374151"
                        }}>
                          {getStatusLabel(selectedNotificationTicketDetails.status)}
                        </span>
                      </div>
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
                        {(() => {
                          if (!selectedNotificationTicketDetails) return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                          const ticketForHistory: Ticket = {
                            id: selectedNotificationTicketDetails.id,
                            number: selectedNotificationTicketDetails.number,
                            title: selectedNotificationTicketDetails.title,
                            description: selectedNotificationTicketDetails.description,
                            creator_id: selectedNotificationTicketDetails.creator_id || "",
                            creator: selectedNotificationTicketDetails.creator,
                            user_agency: selectedNotificationTicketDetails.user_agency,
                            priority: selectedNotificationTicketDetails.priority,
                            status: selectedNotificationTicketDetails.status,
                            type: selectedNotificationTicketDetails.type,
                            category: selectedNotificationTicketDetails.category,
                            technician_id: selectedNotificationTicketDetails.technician_id,
                            technician: selectedNotificationTicketDetails.technician,
                            secretary_id: selectedNotificationTicketDetails.secretary_id,
                            created_at: selectedNotificationTicketDetails.created_at,
                            resolved_at: selectedNotificationTicketDetails.resolved_at,
                            closed_at: selectedNotificationTicketDetails.closed_at,
                            feedback_score: selectedNotificationTicketDetails.feedback_score
                          };
                          const displayHistory = getDisplayHistory(ticketForHistory, ticketHistory);
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
                                    {getHistoryTitle(h, ticketForHistory, ticketHistory)}
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
                                        // Ne pas afficher le reason pour les assignations par Secrétaire/Adjoint DSI
                                        const reason = (h.reason || "").toLowerCase();
                                        const isAssignmentBySecretary = reason.includes("assignation par secrétaire") || 
                                                                         reason.includes("assignation par adjoint") ||
                                                                         reason.includes("secrétaire/adjoint dsi");
                                        if (isAssignmentBySecretary) {
                                          return null;
                                        }
                                        // Si c'est une validation rejetée, extraire seulement "Motif: ..."
                                        let displayReason = h.reason || "";
                                        if (reason.includes("validation utilisateur: rejeté") && displayReason.includes("Motif:")) {
                                          const motifMatch = displayReason.match(/Motif:\s*(.+)/i);
                                          if (motifMatch && motifMatch[1]) {
                                            displayReason = `Motif: ${motifMatch[1].trim()}`;
                                          }
                                        }
                                        // Enlever le doublon "Résumé de la résolution:" si présent
                                        if (displayReason.startsWith("Résumé de la résolution: Résumé de la résolution:")) {
                                          displayReason = displayReason.replace("Résumé de la résolution: Résumé de la résolution:", "Résumé de la résolution:");
                                        }
                                        return (
                                          <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                            {displayReason}
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

        {/* Contenu principal avec scroll */}
        {currentActiveSection !== "notifications" && (
        <div style={{ flex: 1, padding: "30px", overflow: "auto", paddingTop: "80px" }}>
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
                      background: ticketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : ticketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : ticketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                      color: ticketDetails.priority === "critique" ? "#E53E3E" : ticketDetails.priority === "haute" ? "#F59E0B" : ticketDetails.priority === "moyenne" ? "#0DADDB" : "white"
                    }}>
                      {getPriorityLabel(ticketDetails.priority)}
                    </span>
                  </div>
                  <div>
                    <strong>Type :</strong>
                    <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                      {getTypeLabel(ticketDetails.type)}
                    </span>
                  </div>
                  <div>
                    <strong>Catégorie :</strong>
                    <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                      {ticketDetails.category || "Non spécifiée"}
                    </span>
                  </div>
                  <div>
                    <strong>Statut :</strong>
                    <span style={{
                      marginLeft: "8px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "500",
                      background: ticketDetails.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : ticketDetails.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : (ticketDetails.status === "en_traitement" || ticketDetails.status === "en_cours") ? "rgba(15, 31, 61, 0.1)" : ticketDetails.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : ticketDetails.status === "rejete" ? "#fee2e2" : ticketDetails.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                      color: ticketDetails.status === "en_attente_analyse" ? "#0DADDB" : ticketDetails.status === "assigne_technicien" ? "#FF7A1B" : (ticketDetails.status === "en_traitement" || ticketDetails.status === "en_cours") ? "#0F1F3D" : ticketDetails.status === "resolu" ? "#2F9E44" : ticketDetails.status === "rejete" ? "#991b1b" : ticketDetails.status === "cloture" ? "#374151" : "#374151"
                    }}>
                      {getStatusLabel(ticketDetails.status)}
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
                                {getHistoryTitle(h, ticketDetails, ticketHistory)}
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
                                    // Ne pas afficher le reason pour les assignations par Secrétaire/Adjoint DSI
                                    const reason = (h.reason || "").toLowerCase();
                                    const isAssignmentBySecretary = reason.includes("assignation par secrétaire") || 
                                                                     reason.includes("assignation par adjoint") ||
                                                                     reason.includes("secrétaire/adjoint dsi");
                                    if (isAssignmentBySecretary) {
                                      return null;
                                    }
                                    // Si c'est une validation rejetée, extraire seulement "Motif: ..."
                                    let displayReason = h.reason || "";
                                    if (reason.includes("validation utilisateur: rejeté") && displayReason.includes("Motif:")) {
                                      const motifMatch = displayReason.match(/Motif:\s*(.+)/i);
                                      if (motifMatch && motifMatch[1]) {
                                        displayReason = `Motif: ${motifMatch[1].trim()}`;
                                      }
                                    }
                                    // Enlever le doublon "Résumé de la résolution:" si présent
                                    if (displayReason.startsWith("Résumé de la résolution: Résumé de la résolution:")) {
                                      displayReason = displayReason.replace("Résumé de la résolution: Résumé de la résolution:", "Résumé de la résolution:");
                                    }
                                    return (
                                      <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                        {displayReason}
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
                {ticketDetails.status !== "cloture" && (
                  <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
                    <strong>Actions :</strong>
                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {/* Bouton Assigner à un technicien */}
                      {ticketDetails.status === "en_attente_analyse" && (
                        <button
                          onClick={() => {
                            setAssignModalTicketId(ticketDetails.id);
                            setShowAssignModal(true);
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
                          Assigner à un technicien
                        </button>
                      )}

                      {/* Bouton Réouvrir */}
                      {ticketDetails.status === "rejete" && (
                        <button
                          onClick={() => {
                            handleReopenClick(ticketDetails.id);
                          }}
                          disabled={loading}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: "#f59e0b",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "500"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#d97706";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#f59e0b";
                          }}
                        >
                          Réouvrir
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
          <>
          {currentActiveSection === "dashboard" && (
          <>
              <div style={{ marginTop: "40px", marginBottom: "24px" }}>
                <div style={{ fontSize: "24px", fontWeight: "600", color: "#333", marginBottom: "4px" }}>
                  {(roleName === "Secrétaire DSI" || location.pathname.startsWith("/dashboard/secretary")) ? "Espace Secrétaire DSI" : "Espace Adjoint DSI"} 📋
                </div>
                <div style={{ fontSize: "14px", color: "#4b5563" }}>
                  Gestion des tickets délégués
                </div>
              </div>

      {/* Métriques principales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
          gap: "10px",
          margin: "20px 0",
        }}
      >
        {/* Tickets en attente */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            minHeight: "100px",
            overflow: "hidden",
          }}
        >
          {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
          <div
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
            }}
          ></div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#fff4e6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "absolute",
              top: "10px",
              right: "12px",
              zIndex: 1,
            }}
          >
            <Clock3 size={18} color="#ff8a3c" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "3px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {pendingCount}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#374151", position: "relative", zIndex: 1 }}>
            Tickets en attente
          </div>
          <div style={{ marginTop: "2px", fontSize: "10px", color: "#6b7280", position: "relative", zIndex: 1 }}>
            Action requise
          </div>
        </div>

        {/* Tickets délégués */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            minHeight: "100px",
            overflow: "hidden",
          }}
        >
          {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
          <div
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
            }}
          ></div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#f3e8ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "absolute",
              top: "10px",
              right: "12px",
              zIndex: 1,
            }}
          >
            <Forward size={18} color="#9333ea" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "3px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {delegatedTicketsByDSI.size}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#374151", position: "relative", zIndex: 1 }}>
            Tickets délégués
          </div>
          <div style={{ marginTop: "2px", fontSize: "10px", color: "#6b7280", position: "relative", zIndex: 1 }}>
            Par le DSI
          </div>
        </div>

        {/* Tickets assignés */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            minHeight: "100px",
            overflow: "hidden",
          }}
        >
          {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
          <div
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
            }}
          ></div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#e5f0ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "absolute",
              top: "10px",
              right: "12px",
              zIndex: 1,
            }}
          >
            <Users size={18} color="#2563eb" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "3px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {assignedCount}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#374151", position: "relative", zIndex: 1 }}>
            Tickets assignés
          </div>
          <div style={{ marginTop: "2px", fontSize: "10px", color: "#6b7280", position: "relative", zIndex: 1 }}>
            En traitement
          </div>
        </div>

        {/* Tickets résolus */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
            position: "relative",
            minHeight: "100px",
            overflow: "hidden",
          }}
        >
          {/* Cercle décoratif orange en arrière-plan - coin supérieur droit */}
          <div
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
            }}
          ></div>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#dcfce7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "absolute",
              top: "10px",
              right: "12px",
              zIndex: 1,
            }}
          >
            <CheckCircle2 size={18} color="#16a34a" />
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "3px",
              position: "relative",
              zIndex: 1,
            }}
          >
            {resolvedCount}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "#374151", position: "relative", zIndex: 1 }}>
            Tickets résolus
          </div>
          <div style={{ marginTop: "2px", fontSize: "10px", color: "#6b7280", position: "relative", zIndex: 1 }}>
            Aujourd&apos;hui
          </div>
        </div>
      </div>

              <h3 style={{ marginTop: "48px", marginBottom: "20px" }}>Tickets Récents</h3>
              
              {(() => {
                // Filtrer les tickets selon les filtres sélectionnés
                let filtered = [...allTickets];
                
                // Filtre par statut
                if (statusFilter !== "all") {
                  if (statusFilter === "en_traitement") {
                    filtered = filtered.filter((t) => t.status === "assigne_technicien" || t.status === "en_cours");
                  } else {
                    filtered = filtered.filter((t) => t.status === statusFilter);
                  }
                }
                
                // Filtre par agence
                if (agencyFilter !== "all") {
                  filtered = filtered.filter((t) => (t.creator?.agency || t.user_agency) === agencyFilter);
                }
                
                // Filtre par priorité
                if (priorityFilter !== "all") {
                  filtered = filtered.filter((t) => t.priority === priorityFilter);
                }
                
                // Filtre par délégation (UNIQUEMENT pour l'adjoint DSI)
                // Utiliser delegatedTicketsByDSI pour vérifier les tickets réellement délégués par le DSI
                if (roleName === "Adjoint DSI" && delegationFilter !== "all") {
                  if (delegationFilter === "delegated") {
                    filtered = filtered.filter((t) => delegatedTicketsByDSI.has(t.id));
                  } else if (delegationFilter === "not_delegated") {
                    filtered = filtered.filter((t) => !delegatedTicketsByDSI.has(t.id));
                  }
                }
                
                // Obtenir les tickets récents triés par date de création décroissante
                const recentTickets = filtered
                  .sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return dateB - dateA;
                  })
                  .slice(0, 5);
                
                return (
              <div style={{ 
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                overflow: "visible",
              }}>
                {recentTickets.length === 0 ? (
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
                  recentTickets.map((t) => {
                    const isDelegatedToMe = roleName === "Adjoint DSI" && delegatedTicketsByDSI.has(t.id);
                    
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
                    const CategoryIcon = isApplicatif ? Monitor : Wrench;

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

                            {/* Badge Délégué */}
                            {isDelegatedToMe && (
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "600",
                                background: "#ffc107",
                                color: "#856404",
                                whiteSpace: "nowrap"
                              }}>
                                Délégué
                              </span>
                            )}
                          </div>

                          {/* Menu 3 points */}
                          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                            {t.status === "en_attente_analyse" ? (
                              // Actions pour tickets en attente
                              selectedTicket === t.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                        <select
                          value={selectedTechnician}
                          onChange={(e) => setSelectedTechnician(e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "12px", minWidth: "200px" }}
                        >
                          <option value="">Sélectionner un technicien</option>
                          {getFilteredTechnicians(t.type).map((tech) => {
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
                          })}
                        </select>
                        <textarea
                          value={assignmentNotes}
                          onChange={(e) => setAssignmentNotes(e.target.value)}
                          placeholder="Notes/Instructions pour le technicien (optionnel)"
                          rows={2}
                          style={{
                            width: "100%",
                            padding: "6px",
                            fontSize: "12px",
                            border: "1px solid #ddd",
                            borderRadius: "4px"
                          }}
                        />
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            onClick={() => handleAssign(t.id)}
                            disabled={loading || !selectedTechnician}
                            style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading || !selectedTechnician ? "not-allowed" : "pointer", opacity: loading || !selectedTechnician ? 0.6 : 1 }}
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTicket(null);
                              setSelectedTechnician("");
                              setAssignmentNotes("");
                            }}
                            style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
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
                        {openActionsMenuFor === t.id &&  (
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
                                  const menuHeight = 220;
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
                            {!t.technician_id && (
                              <>
                                <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                <button
                                  onClick={() => { 
                                    if (roleName === "Adjoint DSI") {
                                      setAssignModalTicketId(t.id);
                                      setShowAssignModal(true);
                                    } else {
                                      setSelectedTicket(t.id);
                                    }
                                    setOpenActionsMenuFor(null);
                                  }}
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
                                    if (!loading) {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  Assigner
                                </button>
                              </>
                            )}
                            {roleName !== "Secrétaire DSI" && (
                              <>
                                <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                <button
                                  onClick={() => { handleEscalate(t.id); setOpenActionsMenuFor(null); }}
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
                                    if (!loading) {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  Escalader
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : t.status === "assigne_technicien" || t.status === "en_cours" ? (
                    // Actions pour tickets assignés/en cours
                    selectedTicket === t.id ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={selectedTechnician}
                          onChange={(e) => setSelectedTechnician(e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "12px", minWidth: "150px" }}
                        >
                          <option value="">Sélectionner un technicien</option>
                          {getFilteredTechnicians(t.type).map((tech) => {
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
                          })}
                        </select>
                        <button
                          onClick={() => handleReassign(t.id)}
                          disabled={loading}
                          style={{ 
                            fontSize: "12px", 
                            padding: "6px 12px", 
                            backgroundColor: "#dbeafe", 
                            color: "#1e40af", 
                            border: "1px solid #93c5fd",
                            borderRadius: "20px", 
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
                          Confirmer
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTicket(null);
                            setSelectedTechnician("");
                          }}
                          style={{ 
                            fontSize: "12px", 
                            padding: "6px 12px", 
                            backgroundColor: "#e5e7eb", 
                            color: "#374151", 
                            border: "1px solid #d1d5db",
                            borderRadius: "20px", 
                            cursor: "pointer",
                            fontWeight: "500",
                            transition: "all 0.2s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#d1d5db";
                            e.currentTarget.style.borderColor = "#9ca3af";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#e5e7eb";
                            e.currentTarget.style.borderColor = "#d1d5db";
                          }}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
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
                        {openActionsMenuFor === t.id &&  (
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
                                  const menuHeight = 220;
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
                            <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                            <button
                              onClick={() => { handleReassignClick(t.id); setOpenActionsMenuFor(null); }}
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
                                if (!loading) {
                                  e.currentTarget.style.backgroundColor = "#f3f4f6";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              Réassigner
                            </button>
                            {roleName !== "Secrétaire DSI" && (
                              <>
                                <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                <button
                                  onClick={() => { handleEscalate(t.id); setOpenActionsMenuFor(null); }}
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
                                    if (!loading) {
                                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                >
                                  Escalader
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : t.status === "resolu" ? (
                    // Action pour tickets résolus
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          
                          const isOpen = openActionsMenuFor === t.id;
                          if (isOpen) {
                            setOpenActionsMenuFor(null);
(null);
                            return;
                          }

                          const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const viewportHeight = window.innerHeight;
                          const menuWidth = 220;
                          const menuHeight = 120;

                          let top = buttonRect.bottom + 4;
                          if (viewportHeight - buttonRect.bottom < menuHeight && buttonRect.top > menuHeight) {
                            top = buttonRect.top - menuHeight - 4;
                          }

                          let left = buttonRect.right - menuWidth;
                          if (left < 8) left = 8;

({ top, left });
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
                      {openActionsMenuFor === t.id &&  (
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
                                  const menuHeight = 220; // Hauteur approximative du menu (3-4 options)
                                  const margin = 4;
                                  const spaceBelow = viewportHeight - rect.bottom;
                                  const spaceAbove = rect.top;
                                  // Seuil minimum pour afficher vers le haut : besoin de beaucoup d'espace en haut
                                  const minimumSpaceAbove = menuHeight + margin + 100; // Marge très importante
                                  
                                  // Réinitialiser tous les styles de positionnement d'abord
                                  el.style.removeProperty('top');
                                  el.style.removeProperty('bottom');
                                  el.style.removeProperty('margin-top');
                                  el.style.removeProperty('margin-bottom');
                                  
                                  // Afficher vers le haut UNIQUEMENT si:
                                  // 1. Il n'y a vraiment PAS assez d'espace en bas
                                  // 2. ET il y a BEAUCOUP d'espace en haut (au moins 320px = menu + margin + 100px de sécurité)
                                  // Cette condition très stricte évite le découpage du menu
                                  const canShowUp = spaceBelow < (menuHeight + margin) && spaceAbove >= minimumSpaceAbove;
                                  
                                  if (canShowUp) {
                                    el.style.bottom = "100%";
                                    el.style.top = "auto";
                                    el.style.marginBottom = `${margin}px`;
                                    el.style.marginTop = "0";
                                  } else {
                                    // TOUJOURS afficher vers le bas si la condition n'est pas remplie
                                    // Même si cela dépasse un peu, c'est mieux qu'un menu coupé
                                    el.style.top = "100%";
                                    el.style.bottom = "auto";
                                    el.style.marginTop = `${margin}px`;
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
                          <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                          <button
                            onClick={() => { handleClose(t.id); setOpenActionsMenuFor(null); }}
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
                              if (!loading) {
                                e.currentTarget.style.backgroundColor = "#f3f4f6";
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            Clôturer
                          </button>
                        </div>
                      )}
                    </div>
                  ) : t.status === "rejete" ? (
                    // Action pour tickets rejetés - Réouverture
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          
                          const isOpen = openActionsMenuFor === t.id;
                          if (isOpen) {
                            setOpenActionsMenuFor(null);
(null);
                            return;
                          }

                          const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const viewportHeight = window.innerHeight;
                          const menuWidth = 220;
                          const menuHeight = 120;

                          let top = buttonRect.bottom + 4;
                          if (viewportHeight - buttonRect.bottom < menuHeight && buttonRect.top > menuHeight) {
                            top = buttonRect.top - menuHeight - 4;
                          }

                          let left = buttonRect.right - menuWidth;
                          if (left < 8) left = 8;

({ top, left });
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
                      {openActionsMenuFor === t.id &&  (
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
                                  const menuHeight = 220; // Hauteur approximative du menu (3-4 options)
                                  const margin = 4;
                                  const spaceBelow = viewportHeight - rect.bottom;
                                  const spaceAbove = rect.top;
                                  // Seuil minimum pour afficher vers le haut : besoin de beaucoup d'espace en haut
                                  const minimumSpaceAbove = menuHeight + margin + 100; // Marge très importante
                                  
                                  // Réinitialiser tous les styles de positionnement d'abord
                                  el.style.removeProperty('top');
                                  el.style.removeProperty('bottom');
                                  el.style.removeProperty('margin-top');
                                  el.style.removeProperty('margin-bottom');
                                  
                                  // Afficher vers le haut UNIQUEMENT si:
                                  // 1. Il n'y a vraiment PAS assez d'espace en bas
                                  // 2. ET il y a BEAUCOUP d'espace en haut (au moins 320px = menu + margin + 100px de sécurité)
                                  // Cette condition très stricte évite le découpage du menu
                                  const canShowUp = spaceBelow < (menuHeight + margin) && spaceAbove >= minimumSpaceAbove;
                                  
                                  if (canShowUp) {
                                    el.style.bottom = "100%";
                                    el.style.top = "auto";
                                    el.style.marginBottom = `${margin}px`;
                                    el.style.marginTop = "0";
                                  } else {
                                    // TOUJOURS afficher vers le bas si la condition n'est pas remplie
                                    // Même si cela dépasse un peu, c'est mieux qu'un menu coupé
                                    el.style.top = "100%";
                                    el.style.bottom = "auto";
                                    el.style.marginTop = `${margin}px`;
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
                          <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                          <button
                            onClick={() => { handleReopenClick(t.id); setOpenActionsMenuFor(null); }}
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
                              if (!loading) {
                                e.currentTarget.style.backgroundColor = "#f3f4f6";
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            Réouvrir
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Pas d'action pour tickets clôturés - Afficher juste l'icône œil
                    <div style={{ position: "relative" }}>
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

                        {/* Pied de carte : Créateur, Date, Agence, Assigné */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                                {getInitials(t.creator?.full_name || "N/A")}
                              </div>
                              <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                {t.creator?.full_name || "N/A"}
                              </span>
                            </div>

                            {/* Agence */}
                            {(t.creator?.agency || t.user_agency) && (
                              <>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>•</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                    {t.creator?.agency || t.user_agency || "N/A"}
                                  </span>
                                </div>
                              </>
                            )}

                            {/* Date relative */}
                            {t.created_at && (
                              <>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>•</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={12} color="#9ca3af" />
                                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                    {getRelativeTime(t.created_at)}
                                  </span>
                                </div>
                              </>
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
                );
              })()}
            </>
          )}

          {currentActiveSection === "types" && roleName === "Adjoint DSI" && (
            <div style={{ padding: "24px", background: "white" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "24px" }}>
                <button
                  onClick={() => {
                    setNewType({ type: "", description: "", color: "#007bff", is_active: true });
                    setEditingType(null);
                    setShowAddTypeModal(true);
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px",
                    backgroundColor: "#FF6B00", color: "white", border: "none", borderRadius: "8px",
                    cursor: "pointer", fontSize: "14px", fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                >
                  <Plus size={18} />
                  Nouveau type
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: "20px" }}>
                {loadingTypes ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "hsl(220, 15%, 45%)" }}>Chargement des types...</div>
                ) : ticketTypes.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "hsl(220, 15%, 45%)" }}>Aucun type de ticket trouvé</div>
                ) : (
                  ticketTypes.map((ticketType) => {
                    const isMateriel = ticketType.code === "materiel" || ticketType.label.toLowerCase().includes("matériel") || ticketType.label.toLowerCase().includes("materiel");
                    const isApplicatif = ticketType.code === "applicatif" || ticketType.label.toLowerCase().includes("applicatif") || ticketType.label.toLowerCase().includes("logiciel");
                    const description = isMateriel ? "Problèmes liés aux équipements physiques (ordinateurs, imprimantes, etc.)" : isApplicatif ? "Problèmes liés aux logiciels et applications" : `Problèmes liés à ${ticketType.label.toLowerCase()}`;
                    return (
                      <div key={ticketType.id} style={{ background: "#fff", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "20px", display: "flex", gap: "16px", transition: "all 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)"; }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: isMateriel ? "rgba(255, 107, 0, 0.1)" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isMateriel ? <Wrench size={24} color="#FF6B00" /> : <Monitor size={24} color="#64748b" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 }}>{ticketType.label}</h3>
                            {ticketType.is_active && <span style={{ padding: "4px 12px", borderRadius: "9999px", fontSize: "13px", fontWeight: 500, background: "rgba(34, 197, 94, 0.1)", color: "rgb(34, 197, 94)" }}>Actif</span>}
                          </div>
                          <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 8px 0", lineHeight: "1.5" }}>{description}</p>
                          <p style={{ fontSize: "12px", color: "#FF6B00", margin: 0, fontFamily: "monospace" }}>Code: {ticketType.code}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexShrink: 0 }}>
                          <button onClick={(e) => { e.stopPropagation(); handleEditType(ticketType.id); }} style={{ padding: "8px", background: "transparent", border: "none", borderRadius: "6px", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }} title="Modifier"><Pencil size={20} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteType(ticketType.id); }} style={{ padding: "8px", background: "transparent", border: "none", borderRadius: "6px", cursor: "pointer", color: "rgb(239, 68, 68)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Supprimer"><Trash2 size={20} /></button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {showAddTypeModal && (
                <div onClick={() => { setShowAddTypeModal(false); setEditingType(null); setNewType({ type: "", description: "", color: "#007bff", is_active: true }); }} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "8px", width: "100%", maxWidth: "500px", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", padding: "24px", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
                    <button onClick={() => { setShowAddTypeModal(false); setEditingType(null); setNewType({ type: "", description: "", color: "#007bff", is_active: true }); }} style={{ position: "absolute", top: "16px", right: "16px", background: "transparent", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "#111827" }}><X size={20} /></button>
                    <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: "700", color: "#111827" }}>{editingType ? "Modifier le type" : "Ajouter un type"}</h2>
                    <form onSubmit={(e) => { e.preventDefault(); if (editingType) handleUpdateType(); else handleAddType(); }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "400", color: "#111827" }}>Nom du type <span style={{ color: "#dc3545" }}>*</span></label>
                        <input type="text" value={newType.type} onChange={(e) => setNewType({ ...newType, type: e.target.value })} placeholder="Ex: Matériel" required style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "16px", backgroundColor: "white", color: "#111827", height: "40px", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "400", color: "#111827" }}>Code (identifiant technique)</label>
                        <input type="text" value={editingType ? ticketTypes.find(t => t.id === editingType)?.code || "" : (newType.type ? newType.type.toLowerCase().replace(/\s+/g, "-") : "")} readOnly placeholder="Généré automatiquement" style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "16px", fontFamily: "monospace", backgroundColor: "#f3f4f6", color: "#6b7280", cursor: "not-allowed", height: "40px", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "400", color: "#111827" }}>Description</label>
                        <textarea value={newType.description} onChange={(e) => setNewType({ ...newType, description: e.target.value })} placeholder="Ex: Problèmes liés aux équipements physiques (ordinateurs, imprimantes, etc.)" style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", minHeight: "80px", height: "100px", backgroundColor: "white", color: "#111827", resize: "vertical", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                        <label style={{ fontSize: "14px", fontWeight: "400", color: "#111827", margin: 0 }}>Actif</label>
                        <div onClick={handleToggleActiveType} style={{ width: "44px", height: "24px", borderRadius: "12px", background: newType.is_active ? "#22c55e" : "#1E3A5F", position: "relative", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}>
                          <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "white", position: "absolute", top: "2px", right: newType.is_active ? "2px" : "22px", transition: "all 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginTop: "24px" }}>
                        <button type="button" onClick={() => { setShowAddTypeModal(false); setEditingType(null); setNewType({ type: "", description: "", color: "#007bff", is_active: true }); }} style={{ padding: "10px 20px", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "400", height: "40px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>Annuler</button>
                        <button type="submit" style={{ padding: "10px 20px", background: "#F58220", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "700", height: "40px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>{editingType ? "Modifier" : "Ajouter"}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentActiveSection === "categories" && roleName === "Adjoint DSI" && (
            <div style={{ padding: "24px", background: "white", minHeight: "100%" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "24px" }}>
                <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "hsl(25, 95%, 53%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 500 }} onClick={() => { setNewCategoryName(""); setNewCategoryTypeCode(categoriesTypes[0]?.code ?? ""); setShowAddCategoryModal(true); }}>
                  <Plus size={18} />
                  Nouvelle catégorie
                </button>
              </div>
              {loadingCategories ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b", fontSize: "14px" }}>Chargement des catégories...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {categoriesTypes.map((typeItem) => {
                    const count = categoriesList.filter((c) => c.type_code === typeItem.code).length;
                    const isMateriel = typeItem.code === "materiel" || typeItem.label.toLowerCase().includes("matériel") || typeItem.label.toLowerCase().includes("materiel");
                    const isExpanded = expandedCategoryType === typeItem.code;
                    const subCategories = categoriesList.filter((c) => c.type_code === typeItem.code);
                    return (
                      <div key={typeItem.id} style={{ background: "white", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
                        <div onClick={() => setExpandedCategoryType(isExpanded ? null : typeItem.code)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", cursor: "pointer" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isMateriel ? <Wrench size={18} color="hsl(25, 95%, 53%)" /> : <Monitor size={18} color="#1E3A5F" />}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                            <span style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>{typeItem.label}</span>
                            <span style={{ minWidth: "22px", height: "22px", borderRadius: "9999px", backgroundColor: "hsl(25, 95%, 53%)", color: "white", fontSize: "12px", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>{count}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}><ChevronDown size={18} color="#64748b" /></div>
                        </div>
                        {isExpanded && (
                          <div style={{ borderTop: "1px solid #e2e8f0", padding: "16px 20px", background: "white" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                              {subCategories.length === 0 ? <div style={{ color: "#64748b", fontSize: "13px" }}>Aucune catégorie</div> : subCategories.map((cat) => (
                                <div key={cat.id} style={{ background: "#fff", borderRadius: "0.75rem", border: "1px solid #e2e8f0", padding: "16px 20px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                                    <Tag size={18} color="#64748b" />
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>{cat.name}</span>
                                      {cat.is_active && <span style={{ padding: "3px 8px", borderRadius: "9999px", border: "1px solid #cbd5e1", color: "#64748b", fontSize: "12px", fontWeight: 500 }}>Actif</span>}
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                      <button type="button" onClick={() => { setEditingCategory(cat); setEditCategoryName(cat.name); setEditCategoryTypeCode(cat.type_code); setShowEditCategoryModal(true); }} style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Modifier"><Pencil size={18} color="#64748b" /></button>
                                      <button type="button" style={{ padding: "4px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Supprimer"><Trash2 size={18} color="rgb(239, 68, 68)" /></button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {categoriesTypes.length === 0 && !loadingCategories && <div style={{ textAlign: "center", padding: "40px", color: "#64748b", fontSize: "14px" }}>Aucun type de ticket. Ajoutez des types dans la section Types.</div>}
                </div>
              )}
              {showAddCategoryModal && (
                <div onClick={() => setShowAddCategoryModal(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "480px", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", padding: "24px", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
                    <button onClick={() => setShowAddCategoryModal(false)} style={{ position: "absolute", top: "16px", right: "16px", background: "transparent", border: "none", cursor: "pointer", padding: "4px" }}><X size={20} /></button>
                    <h2 style={{ marginBottom: "24px", fontSize: "18px", fontWeight: 600, color: "#111827" }}>Nouvelle catégorie</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#111827" }}>Nom de la catégorie</label>
                        <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="ex: Périphériques" style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", backgroundColor: "white", color: "#111827", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#111827" }}>Type de ticket</label>
                        <select value={newCategoryTypeCode} onChange={(e) => setNewCategoryTypeCode(e.target.value)} style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", backgroundColor: "white", color: "#111827", boxSizing: "border-box", cursor: "pointer" }}>
                          {categoriesTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                        <button type="button" onClick={() => setShowAddCategoryModal(false)} style={{ padding: "10px 20px", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}>Annuler</button>
                        <button type="button" onClick={handleAddCategory} style={{ padding: "10px 20px", background: "hsl(25, 95%, 53%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>Ajouter</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {showEditCategoryModal && editingCategory && (
                <div onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null); }} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "480px", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", padding: "24px", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
                    <button onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null); }} style={{ position: "absolute", top: "16px", right: "16px", background: "transparent", border: "none", cursor: "pointer", padding: "4px" }}><X size={20} /></button>
                    <h2 style={{ marginBottom: "24px", fontSize: "18px", fontWeight: 600, color: "#111827" }}>Modifier la catégorie</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#111827" }}>Nom de la catégorie</label>
                        <input type="text" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", backgroundColor: "white", color: "#111827", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#111827" }}>Type de ticket</label>
                        <select value={editCategoryTypeCode} onChange={(e) => setEditCategoryTypeCode(e.target.value)} style={{ width: "100%", padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", backgroundColor: "white", color: "#111827", boxSizing: "border-box", cursor: "pointer" }}>
                          {categoriesTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                        <button type="button" onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null); }} style={{ padding: "10px 20px", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 500 }}>Annuler</button>
                        <button type="button" onClick={handleUpdateCategory} style={{ padding: "10px 20px", background: "hsl(25, 95%, 53%)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>Modifier</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentActiveSection === "actifs" && roleName === "Adjoint DSI" && (
            <div style={{ marginTop: "40px", marginBottom: "24px" }}>
              {/* Boutons Exporter / Nouvel actif - au-dessus des 8 KPIs, au coin droit */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "24px",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    backgroundColor: "#ffffff",
                    color: "#111827",
                    border: "1px solid #9ca3af",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Download size={18} />
                  Exporter
                </button>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    backgroundColor: "hsl(226, 34%, 15%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={18} />
                  Nouvel actif
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                {/* Total Actifs */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  {/* Icône à gauche */}
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(220, 15%, 93%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Monitor size={18} color="#4b5563" />
                  </div>
                  {/* Valeur + libellé */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>Total Actifs</div>
                  </div>
                </div>

                {/* En service */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(145, 60%, 90%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckCircle size={18} color="#16a34a" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>En service</div>
                  </div>
                </div>

                {/* En maintenance */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(45, 80%, 90%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Wrench size={18} color="#f97316" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>En maintenance</div>
                  </div>
                </div>

                {/* En panne */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(0, 80%, 93%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AlertTriangle size={18} color="#ef4444" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>En panne</div>
                  </div>
                </div>

                {/* En stock */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(230, 60%, 93%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Package size={18} color="#2563eb" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>En stock</div>
                  </div>
                </div>

                {/* Réformés */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(220, 15%, 93%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Archive size={18} color="#4b5563" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>Réformés</div>
                  </div>
                </div>

                {/* Valeur totale */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(145, 60%, 90%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Banknote size={18} color="#16a34a" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0 FCFA</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>Valeur totale</div>
                  </div>
                </div>

                {/* Garanties expirant */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    border: "1px solid rgba(229,231,235,0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "hsl(25, 80%, 92%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Clock size={18} color="#f97316" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>0</div>
                    <div style={{ fontSize: "14px", color: "#6b7280", fontWeight: 500 }}>Garanties expirant</div>
                    <div style={{ fontSize: "11px", color: "#9ca3af" }}>dans 30 jours</div>
                  </div>
                </div>
              </div>

              {/* Barre de recherche et filtres Actifs (Adjoint DSI) */}
              <div
                style={{
                  marginTop: "24px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                {/* Recherche actifs */}
                <div
                  style={{
                    flex: "1 1 260px",
                    minWidth: "220px",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Search
                    size={18}
                    color="#6b7280"
                    style={{
                      position: "absolute",
                      left: "14px",
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Rechercher par nom, n° série, marque..."
                    style={{
                      width: "100%",
                      padding: "10px 14px 10px 40px",
                      borderRadius: "999px",
                      border: "1px solid rgba(209,213,219,0.8)",
                      backgroundColor: "#f9fafb",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Tous les statuts */}
                <div style={{ flex: "0 0 190px", minWidth: "170px" }}>
                  <OrangeSelect
                    value={assetStatusFilter}
                    onChange={setAssetStatusFilter}
                    options={[
                      { value: "all", label: "Tous les statuts" },
                      { value: "en_service", label: "En service" },
                      { value: "en_maintenance", label: "En maintenance" },
                      { value: "en_panne", label: "En panne" },
                      { value: "reformes", label: "Réformés" },
                      { value: "en_stock", label: "En stock" },
                    ]}
                  />
                </div>

                {/* Tous les types */}
                <div style={{ flex: "0 0 190px", minWidth: "170px" }}>
                  <OrangeSelect
                    value={assetTypeFilter}
                    onChange={setAssetTypeFilter}
                    options={[
                      { value: "all", label: "Tous les types" },
                    ]}
                  />
                </div>

                {/* Tous les départements */}
                <div style={{ flex: "0 0 210px", minWidth: "180px" }}>
                  <OrangeSelect
                    value={assetDepartmentFilter}
                    onChange={setAssetDepartmentFilter}
                    options={[
                      { value: "all", label: "Tous les départements" },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {currentActiveSection === "tickets" && (
            <>
              {/* Barre de recherche (au-dessus des filtres avancés, comme DSI) */}
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
                  onChange={(e) => setTicketSearchQuery(e.target.value)}
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

              {/* Filtres avancés (Adjoint DSI uniquement, au-dessus des 4 filtres existants) */}
              {roleName === "Adjoint DSI" && (
                <div style={{ border: "1px solid rgba(148, 163, 184, 0.5)", borderRadius: "12px", padding: "16px", marginTop: "8px", marginBottom: "24px", backgroundColor: "#ffffff", boxShadow: "0 1px 2px rgba(15, 23, 42, 0.02)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Filter size={16} color="#f97316" />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#0f172a" }}>Filtres avancés</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={() => { try { const wb = XLSX.utils.book_new(); const rows = filteredTickets.map((t) => ({ Numéro: `TKT-${t.number.toString().padStart(3, "0")}`, Titre: t.title, Description: t.description || "", Statut: t.status, Priorité: t.priority || "", Catégorie: t.category || "", Type: t.type || "", Agence: t.creator?.agency || t.user_agency || "", Créé_par: t.creator?.full_name || "", Technicien: t.technician?.full_name || "", Créé_le: t.created_at ? new Date(t.created_at).toLocaleString("fr-FR") : "", Résolu_le: t.resolved_at ? new Date(t.resolved_at).toLocaleString("fr-FR") : "" })); const ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, "Tickets"); XLSX.writeFile(wb, `Tickets_Adjoint_DSI_${new Date().toISOString().split("T")[0]}.xlsx`); } catch (e) { console.error(e); alert("Erreur export Excel"); } }} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "9999px", border: "1px solid #e5e7eb", backgroundColor: "#f9fafb", fontSize: "13px", fontWeight: 500, color: "#0f172a", cursor: "pointer" }}>
                        <FileSpreadsheet size={16} /><span>Excel</span>
                      </button>
                      <button type="button" onClick={() => { try { const doc = new jsPDF(); doc.setFontSize(14); doc.text("Liste des tickets (Adjoint DSI)", 14, 20); doc.setFontSize(10); doc.text(`Généré le: ${new Date().toLocaleString("fr-FR")}`, 14, 28); autoTable(doc, { startY: 34, head: [["N°", "Titre", "Priorité", "Statut", "Catégorie", "Type", "Agence", "Créé par", "Technicien"]], body: filteredTickets.map((t) => [`TKT-${t.number.toString().padStart(3, "0")}`, t.title, t.priority || "", t.status, t.category || "", t.type || "", t.creator?.agency || t.user_agency || "", t.creator?.full_name || "", t.technician?.full_name || ""]), styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] } }); doc.save(`Tickets_Adjoint_DSI_${new Date().toISOString().split("T")[0]}.pdf`); } catch (e) { console.error(e); alert("Erreur export PDF"); } }} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "9999px", border: "1px solid #e5e7eb", backgroundColor: "#f9fafb", fontSize: "13px", fontWeight: 500, color: "#0f172a", cursor: "pointer" }}>
                        <FileText size={16} /><span>PDF</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 16px" }}>
                    {/* Période (Adjoint DSI) - Popover + react-day-picker, 2 mois côte à côte */}
                    <div ref={periodCalendarRef} style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "4px", position: "relative" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Calendar size={12} /><span>Période</span></span>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowPeriodCalendar((v) => !v)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowPeriodCalendar((v) => !v); } }}
                        className="dsi-period-filter-trigger"
                        style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e5e7eb", backgroundColor: "#f9fafb", fontSize: "14px", color: "#6b7280", height: "36px", cursor: "pointer" }}
                      >
                        <Calendar size={16} color="#6b7280" />
                        <span>
                          {advancedPeriodRange?.from ? (advancedPeriodRange.to ? `${advancedPeriodRange.from.toLocaleDateString("fr-FR")} – ${advancedPeriodRange.to.toLocaleDateString("fr-FR")}` : advancedPeriodRange.from.toLocaleDateString("fr-FR")) : "Sélectionner une période"}
                        </span>
                      </div>
                      {showPeriodCalendar && (
                        <div
                          style={{ position: "absolute", top: "100%", left: 0, marginTop: "4px", zIndex: 1000, backgroundColor: "#fff", borderRadius: "8px", boxShadow: "0 4px 14px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", padding: "12px", pointerEvents: "auto", minWidth: "560px" }}
                          className="rdp-root"
                        >
                          <DayPicker
                            mode="range"
                            numberOfMonths={2}
                            locale={fr}
                            weekStartsOn={1}
                            showOutsideDays
                            selected={advancedPeriodRange}
                            onSelect={(range) => setAdvancedPeriodRange(range)}
                            defaultMonth={advancedPeriodRange?.from ?? new Date()}
                            navLayout="around"
                            styles={{ months: { flexWrap: "nowrap", display: "flex", gap: "2rem" } }}
                          />
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Building2 size={12} /><span>Agence</span></span>
                      <OrangeSelect value={advancedAgencyFilter} onChange={setAdvancedAgencyFilter} options={[{ value: "all", label: "Toutes les agences" }, ...allAgencies.map((a) => ({ value: a || "", label: a || "" }))]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><AlertTriangle size={12} /><span>Catégorie</span></span>
                      <OrangeSelect value={advancedCategoryFilter} onChange={setAdvancedCategoryFilter} options={[{ value: "all", label: "Toutes" }, ...advancedCategories.map((c) => ({ value: c, label: c }))]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Layers size={12} /><span>Type</span></span>
                      <OrangeSelect value={advancedTypeFilter} onChange={setAdvancedTypeFilter} options={[{ value: "all", label: "Tous" }, ...advancedTypes.map((ty) => ({ value: ty, label: ty }))]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><CheckCircle size={12} /><span>Statut</span></span>
                      <OrangeSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "Tous" }, { value: "en_attente_analyse", label: "En attente d'assignation" }, { value: "en_traitement", label: "En traitement" }, { value: "resolu", label: "Résolus" }, { value: "cloture", label: "Clôturés" }, { value: "rejete", label: "Relancés" }]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Flag size={12} /><span>Priorité</span></span>
                      <OrangeSelect value={priorityFilter} onChange={setPriorityFilter} options={[{ value: "all", label: "Toutes" }, { value: "critique", label: "Critique" }, { value: "haute", label: "Haute" }, { value: "moyenne", label: "Moyenne" }, { value: "faible", label: "Faible" }]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Share2 size={12} /><span>Délégation</span></span>
                      <OrangeSelect value={delegationFilter} onChange={setDelegationFilter} options={[{ value: "all", label: "Tous" }, { value: "delegated", label: "Tickets délégués par DSI" }, { value: "not_delegated", label: "Tickets non délégués" }]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><Clock size={12} /><span>Non résolu depuis</span></span>
                      <OrangeSelect value={advancedNonResolvedFilter} onChange={setAdvancedNonResolvedFilter} options={[{ value: "all", label: "Tous" }, { value: "3", label: "3+ jours" }, { value: "5", label: "5+ jours" }, { value: "7", label: "7+ jours (1 semaine)" }, { value: "14", label: "14+ jours (2 semaines)" }, { value: "30", label: "30+ jours (1 mois)" }]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}><User size={12} /><span>Utilisateur</span></span>
                      <OrangeSelect value={advancedUserFilter} onChange={setAdvancedUserFilter} options={[{ value: "all", label: "Tous" }, ...advancedUsers.map((u) => ({ value: u, label: u }))]} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>Créé par (nom)</span>
                      <input type="text" placeholder="Rechercher..." value={advancedCreatorFilter} onChange={(e) => setAdvancedCreatorFilter(e.target.value)} style={{ width: "100%", padding: "6px 10px", borderRadius: "8px", border: "1px solid #e5e7eb", backgroundColor: "#f9fafb", fontSize: "14px", height: "36px", color: "#111827" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Filtres */}
              <div style={{ 
                display: "flex", 
                gap: "16px", 
                marginTop: "24px",
                marginBottom: "24px", 
                flexWrap: "wrap"
              }}>
              </div>

              {/* Compteur de tickets avec icône */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "8px",
                marginTop: "12px",
                marginBottom: "12px"
              }}>
                <TicketIcon size={20} color="#4b5563" />
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
                    const isDelegatedToMe = roleName === "Adjoint DSI" && delegatedTicketsByDSI.has(t.id);
                    
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
                    const CategoryIcon = isApplicatif ? Monitor : Wrench;

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

                            {/* Badge Délégué */}
                            {isDelegatedToMe && (
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "10px",
                                fontWeight: "600",
                                background: "#ffc107",
                                color: "#856404",
                                whiteSpace: "nowrap"
                              }}>
                                Délégué
                              </span>
                            )}
                          </div>

                          {/* Menu 3 points */}
                          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                          {t.status === "en_attente_analyse" ? (
                            selectedTicket === t.id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                                <select
                                  value={selectedTechnician}
                                  onChange={(e) => setSelectedTechnician(e.target.value)}
                                  style={{ padding: "4px 8px", fontSize: "12px", minWidth: "200px" }}
                                >
                                  <option value="">Sélectionner un technicien</option>
                                  {getFilteredTechnicians(t.type).map((tech) => {
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
                                  })}
                                </select>
                                <textarea
                                  value={assignmentNotes}
                                  onChange={(e) => setAssignmentNotes(e.target.value)}
                                  placeholder="Notes/Instructions pour le technicien (optionnel)"
                                  rows={2}
                                  style={{
                                    width: "100%",
                                    padding: "6px",
                                    fontSize: "12px",
                                    border: "1px solid #ddd",
                                    borderRadius: "4px"
                                  }}
                                />
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    onClick={() => handleAssign(t.id)}
                                    disabled={loading || !selectedTechnician}
                                    style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading || !selectedTechnician ? "not-allowed" : "pointer", opacity: loading || !selectedTechnician ? 0.6 : 1 }}
                                  >
                                    Confirmer
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedTicket(null);
                                      setSelectedTechnician("");
                                      setAssignmentNotes("");
                                    }}
                                    style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  >
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : (
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
                              {openActionsMenuFor === t.id &&  (
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
                                        const menuHeight = 220;
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
                                  {!t.technician_id && (
                                    <>
                                      <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                      <button
                                        onClick={() => { 
                                          if (roleName === "Adjoint DSI") {
                                            setAssignModalTicketId(t.id);
                                            setShowAssignModal(true);
                                          } else {
                                            setSelectedTicket(t.id);
                                          }
                                          setOpenActionsMenuFor(null);
                                        }}
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
                                          if (!loading) {
                                            e.currentTarget.style.backgroundColor = "#f3f4f6";
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = "transparent";
                                        }}
                                      >
                                        Assigner
                                      </button>
                                    </>
                                  )}
                                  {roleName !== "Secrétaire DSI" && (
                                    <>
                                      <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                      <button
                                        onClick={() => { handleEscalate(t.id); setOpenActionsMenuFor(null); }}
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
                                          if (!loading) {
                                            e.currentTarget.style.backgroundColor = "#f3f4f6";
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = "transparent";
                                        }}
                                      >
                                        Escalader
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            )
                          ) : t.status === "assigne_technicien" || t.status === "en_cours" ? (
                            selectedTicket === t.id ? (
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                <select
                                  value={selectedTechnician}
                                  onChange={(e) => setSelectedTechnician(e.target.value)}
                                  style={{ padding: "4px 8px", fontSize: "12px", minWidth: "150px" }}
                                >
                                  <option value="">Sélectionner un technicien</option>
                                  {getFilteredTechnicians(t.type).map((tech) => {
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
                                  })}
                                </select>
                                <button
                                  onClick={() => handleReassign(t.id)}
                                  disabled={loading}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                                >
                                  Confirmer
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTicket(null);
                                    setSelectedTechnician("");
                                  }}
                                  style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
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
                                {openActionsMenuFor === t.id &&  (
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
                                          const menuHeight = 220;
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
                                    <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                    <button
                                      onClick={() => { handleReassignClick(t.id); setOpenActionsMenuFor(null); }}
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
                                        if (!loading) {
                                          e.currentTarget.style.backgroundColor = "#f3f4f6";
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                      }}
                                    >
                                      Réassigner
                                    </button>
                                    {roleName !== "Secrétaire DSI" && (
                                      <>
                                        <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                        <button
                                          onClick={() => { handleEscalate(t.id); setOpenActionsMenuFor(null); }}
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
                                            if (!loading) {
                                              e.currentTarget.style.backgroundColor = "#f3f4f6";
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "transparent";
                                          }}
                                        >
                                          Escalader
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          ) : t.status === "resolu" ? (
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
                              {openActionsMenuFor === t.id &&  (
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
                                        const menuHeight = 220;
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
                                  <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                  <button
                                    onClick={() => { handleClose(t.id); setOpenActionsMenuFor(null); }}
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
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    Clôturer
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : t.status === "rejete" ? (
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
                              {openActionsMenuFor === t.id &&  (
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
                                        const menuHeight = 220;
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
                                  <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
                                  <button
                                    onClick={() => { handleReopenClick(t.id); setOpenActionsMenuFor(null); }}
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
                                      if (!loading) {
                                        e.currentTarget.style.backgroundColor = "#f3f4f6";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                  >
                                    Réouvrir
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            // Pas d'action pour tickets clôturés - Afficher juste l'icône œil
                            <div style={{ position: "relative" }}>
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

                        {/* Pied de carte : Créateur, Date, Agence, Assigné */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                                {getInitials(t.creator?.full_name || "N/A")}
                              </div>
                              <span style={{ fontSize: "12px", color: "#374151", fontWeight: "500" }}>
                                {t.creator?.full_name || "N/A"}
                              </span>
                            </div>

                            {/* Agence */}
                            {(t.creator?.agency || t.user_agency) && (
                              <>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>•</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                    {t.creator?.agency || t.user_agency || "N/A"}
                                  </span>
                                </div>
                              </>
                            )}

                            {/* Date relative */}
                            {t.created_at && (
                              <>
                                <span style={{ fontSize: "11px", color: "#9ca3af" }}>•</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={12} color="#9ca3af" />
                                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                                    {getRelativeTime(t.created_at)}
                                  </span>
                                </div>
                              </>
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
            <h3 style={{ marginBottom: "16px", fontSize: "20px" }}>Détails du ticket {formatTicketNumber(ticketDetails.number)}</h3>
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
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "500",
                  background: ticketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : ticketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : ticketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : ticketDetails.priority === "faible" ? "#E5E7EB" : "#9e9e9e",
                  color: ticketDetails.priority === "critique" ? "#E53E3E" : ticketDetails.priority === "haute" ? "#F59E0B" : ticketDetails.priority === "faible" ? "#6B7280" : ticketDetails.priority === "moyenne" ? "#0DADDB" : "#374151"
                }}>
                  {getPriorityLabel(ticketDetails.priority)}
                </span>
              </div>
              <div>
                <strong>Type :</strong>
                <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                  {getTypeLabel(ticketDetails.type)}
                </span>
              </div>
              <div>
                <strong>Catégorie :</strong>
                <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                  {ticketDetails.category || "Non spécifiée"}
                </span>
              </div>
              <div>
                <strong>Statut :</strong>
                <span style={{
                  marginLeft: "8px",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "500",
                  background: ticketDetails.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : ticketDetails.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : (ticketDetails.status === "en_traitement" || ticketDetails.status === "en_cours") ? "rgba(15, 31, 61, 0.1)" : ticketDetails.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : ticketDetails.status === "rejete" ? "#fee2e2" : ticketDetails.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                  color: ticketDetails.status === "en_attente_analyse" ? "#0DADDB" : ticketDetails.status === "assigne_technicien" ? "#FF7A1B" : (ticketDetails.status === "en_traitement" || ticketDetails.status === "en_cours") ? "#0F1F3D" : ticketDetails.status === "resolu" ? "#2F9E44" : ticketDetails.status === "rejete" ? "#991b1b" : ticketDetails.status === "cloture" ? "#374151" : "#374151"
                }}>
                  {getStatusLabel(ticketDetails.status)}
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
                  if (!ticketDetails) return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
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
                            {getHistoryTitle(h, ticketDetails, ticketHistory)}
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
                                // Ne pas afficher le reason pour les assignations par Secrétaire/Adjoint DSI
                                const reason = (h.reason || "").toLowerCase();
                                const isAssignmentBySecretary = reason.includes("assignation par secrétaire") || 
                                                                 reason.includes("assignation par adjoint") ||
                                                                 reason.includes("secrétaire/adjoint dsi");
                                if (isAssignmentBySecretary) {
                                  return null;
                                }
                                // Si c'est une validation rejetée, extraire seulement "Motif: ..."
                                let displayReason = h.reason || "";
                                if (reason.includes("validation utilisateur: rejeté") && displayReason.includes("Motif:")) {
                                  const motifMatch = displayReason.match(/Motif:\s*(.+)/i);
                                  if (motifMatch && motifMatch[1]) {
                                    displayReason = `Motif: ${motifMatch[1].trim()}`;
                                  }
                                }
                                // Enlever le doublon "Résumé de la résolution:" si présent
                                if (displayReason.startsWith("Résumé de la résolution: Résumé de la résolution:")) {
                                  displayReason = displayReason.replace("Résumé de la résolution: Résumé de la résolution:", "Résumé de la résolution:");
                                }
                                return (
                                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                    {displayReason}
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

          {currentActiveSection === "technicians" && (
            <div style={{ padding: "24px" }}>
              <div style={{
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
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
                      
                      // Calculer les statistiques réelles à partir des tickets
                      const techTickets = allTickets.filter((t: Ticket) => t.technician_id === tech.id);
                      
                      // En cours : tickets avec status "en_cours"
                      const inProgressCount = techTickets.filter((t: Ticket) => t.status === "en_cours").length;
                      
                      // Assignés : tickets avec status "assigne_technicien" ou "en_cours"
                      const assignedCount = techTickets.filter((t: Ticket) => 
                        t.status === "assigne_technicien" || t.status === "en_cours"
                      ).length;
                      
                      // Résolus : tickets avec status "resolu" ou "cloture"
                      const resolvedCount = techTickets.filter((t: Ticket) => 
                        t.status === "resolu" || t.status === "cloture"
                      ).length;
                      
                      // Relancés : tickets qui ont été rejetés puis réouverts (status "rejete" ou qui ont été réouverts)
                      const reopenedCount = techTickets.filter((t: Ticket) => 
                        t.status === "rejete"
                      ).length;
                      
                      return (
                        <div
                          key={tech.id}
                          style={{
                            background: "white",
                            border: "1px solid hsla(220, 20%, 92%, 0.5)",
                            borderRadius: "8px",
                            padding: "10px",
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
                          <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                            {/* Avatar */}
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "hsla(25, 95%, 53%, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "hsl(25, 95%, 53%)",
                              fontSize: "12px",
                              fontWeight: 600,
                              flexShrink: 0
                            }}>
                              {initials}
                            </div>
                            
                            {/* Infos */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "#111827",
                                marginBottom: "2px"
                              }}>
                                {tech.full_name}
                              </div>
                              <div style={{
                                fontSize: "12px",
                                color: "hsl(220, 15%, 45%)",
                                marginBottom: "8px"
                              }}>
                                {tech.email}
                              </div>
                              
                              {/* Badge spécialisation */}
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {tech.specialization === "materiel" ? (
                                  <>
                                    <Wrench size={10} color="hsl(220, 15%, 45%)" />
                                    <span style={{
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      border: "1px solid hsla(220, 20%, 92%, 0.5)",
                                      color: "hsl(220, 15%, 45%)"
                                    }}>
                                      Matériel
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="hsl(220, 15%, 45%)" strokeWidth="2">
                                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                      <line x1="8" y1="21" x2="16" y2="21"></line>
                                      <line x1="12" y1="17" x2="12" y2="21"></line>
                                    </svg>
                                    <span style={{
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
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
                            gap: "4px",
                            marginTop: "8px"
                          }}>
                            {/* En cours */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <Clock size={10} color="hsl(199, 89%, 48%)" />
                                <span style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "hsl(199, 89%, 48%)"
                                }}>
                                  {inProgressCount}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "10px",
                                color: "hsl(220, 15%, 45%)"
                              }}>
                                En cours
                              </span>
                            </div>

                            {/* Assignés */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <Wrench size={10} color="hsl(25, 95%, 53%)" />
                                <span style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "hsl(25, 95%, 53%)"
                                }}>
                                  {assignedCount}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "10px",
                                color: "hsl(220, 15%, 45%)"
                              }}>
                                Assignés
                              </span>
                            </div>

                            {/* Résolus */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <CheckCircle2 size={10} color="hsl(142, 76%, 36%)" />
                                <span style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "hsl(142, 76%, 36%)"
                                }}>
                                  {resolvedCount}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "10px",
                                color: "hsl(220, 15%, 45%)"
                              }}>
                                Résolus
                              </span>
                            </div>

                            {/* Relancés */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <AlertTriangle size={10} color="hsl(0, 84%, 60%)" />
                                <span style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "hsl(0, 84%, 60%)"
                                }}>
                                  {reopenedCount}
                                </span>
                              </div>
                              <span style={{
                                fontSize: "10px",
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
          )}

          {currentActiveSection === "reports" && roleName === "Adjoint DSI" && (
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

          {currentActiveSection === "reports" && (roleName === "DSI" || roleName === "Admin") && (
            <>
              <h2 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#333" }}>Rapports</h2>
              
              {!selectedReport && !showGenerateReport && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600" }}>
                      <span style={{ color: "#dc3545" }}>Types</span>{" "}
                      <span style={{ color: "#000" }}>de</span>{" "}
                      <span style={{ color: "#dc3545" }}>Rapports</span> :
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "8px", 
                          padding: "12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8f9fa"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        onClick={() => setSelectedReport("performance")}
                      >
                        <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#007bff" strokeWidth="1.5">
                            <path d="M2 2v8h8" />
                          </svg>
                        </div>
                        <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <rect x="4" y="14" width="3" height="6" fill="#007bff" />
                            <rect x="9" y="10" width="3" height="10" fill="#28a745" />
                            <rect x="14" y="6" width="3" height="14" fill="#28a745" />
                          </svg>
                        </div>
                        <span style={{ fontSize: "16px" }}>
                          <span style={{ color: "#dc3545" }}>Rapports</span>{" "}
                          <span style={{ color: "#000" }}>de</span>{" "}
                          <span style={{ color: "#dc3545" }}>Performance</span>
                        </span>
                      </div>
                      <div 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "8px", 
                          padding: "12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8f9fa"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        onClick={() => setSelectedReport("utilisateurs")}
                      >
                        <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#007bff" strokeWidth="1.5">
                            <path d="M2 2v8h8" />
                          </svg>
                        </div>
                        <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </div>
                        <span style={{ fontSize: "16px", color: "#dc3545" }}>Rapports Utilisateurs</span>
                      </div>
                      <div 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "8px", 
                          padding: "12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8f9fa"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        onClick={() => setSelectedReport("tickets")}
                      >
                        <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#007bff" strokeWidth="1.5">
                            <path d="M2 2v8h8" />
                          </svg>
                        </div>
                        <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffc107" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="16" rx="2" fill="none" />
                            <path d="M3 8h18" />
                            <path d="M8 12h8" />
                          </svg>
                        </div>
                        <span style={{ fontSize: "16px", color: "#dc3545" }}>Rapports Tickets</span>
                      </div>
                      <div 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "8px", 
                          padding: "12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8f9fa"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        onClick={() => setSelectedReport("techniciens")}
                      >
                        <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#007bff" strokeWidth="1.5">
                            <path d="M2 2v8h8" />
                          </svg>
                        </div>
                        <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc3545" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="20" x2="21" y2="20" />
                            <line x1="3" y1="20" x2="3" y2="4" />
                            <polyline points="4 16 8 12 12 8 16 6 20 4" stroke="#dc3545" fill="none" />
                          </svg>
                        </div>
                        <span style={{ fontSize: "16px", color: "#dc3545" }}>Rapports Techniciens</span>
                      </div>
                      <div 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "8px", 
                          padding: "12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8f9fa"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        onClick={() => setSelectedReport("audit")}
                      >
                        <div style={{ width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#007bff" }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#007bff" strokeWidth="1.5">
                            <path d="M2 2v8h8" />
                          </svg>
                        </div>
                        <div style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#6c757d" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                        </div>
                        <span style={{ fontSize: "16px" }}>
                          <span style={{ color: "#dc3545" }}>Audit</span>{" "}
                          <span style={{ color: "#000" }}>et</span>{" "}
                          <span style={{ color: "#dc3545" }}>Logs</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
                      <span style={{ color: "#dc3545" }}>Rapports</span>{" "}
                      <span style={{ color: "#dc3545" }}>Récents</span> :
                    </h3>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                          <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Rapport</th>
                          <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Généré par</th>
                          <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Date</th>
                          <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "#333" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentReports.length > 0 ? (
                          recentReports.map((report) => (
                            <tr key={report.id} style={{ borderBottom: "1px solid #dee2e6" }}>
                              <td style={{ padding: "12px" }}>
                                <span style={{ color: "#007bff", textDecoration: "underline", cursor: "pointer" }}>{report.name}</span>
                              </td>
                              <td style={{ padding: "12px", color: "#333" }}>{report.generated_by}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{ color: "#007bff", textDecoration: "underline", cursor: "pointer" }}>{report.date}</span>
                              </td>
                              <td style={{ padding: "12px" }}>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <button 
                                    onClick={() => {
                                      // Voir le rapport
                                      console.log("Voir rapport:", report.id);
                                    }}
                                    style={{ 
                                      padding: "6px 10px", 
                                      backgroundColor: "transparent", 
                                      color: "#007bff", 
                                      border: "none", 
                                      borderRadius: "4px", 
                                      cursor: "pointer",
                                      fontSize: "16px"
                                    }}
                                    title="Voir"
                                  >
                                    👁️
                                  </button>
                                  <button 
                                    onClick={() => {
                                      // Télécharger le rapport
                                      console.log("Télécharger rapport:", report.id);
                                    }}
                                    style={{ 
                                      padding: "6px 10px", 
                                      backgroundColor: "transparent", 
                                      color: "#007bff", 
                                      border: "none", 
                                      borderRadius: "4px", 
                                      cursor: "pointer",
                                      fontSize: "16px"
                                    }}
                                    title="Télécharger"
                                  >
                                    ⬇️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} style={{ padding: "12px", color: "#666", textAlign: "center" }}>
                              Aucun rapport récent
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: "32px", textAlign: "left" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("Bouton cliqué - ouverture du formulaire");
                        console.log("showGenerateReport avant:", showGenerateReport);
                        console.log("showOutputFormat avant:", showOutputFormat);
                        // Forcer le re-render en utilisant une fonction de callback
                        setShowGenerateReport((prev) => {
                          console.log("setShowGenerateReport appelé, prev:", prev);
                          return true;
                        });
                        setShowOutputFormat(false);
                        setSelectedReport("");
                        console.log("showGenerateReport devrait être true maintenant");
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#333",
                        fontSize: "16px",
                        cursor: "pointer",
                        padding: "8px 0",
                        fontWeight: "500"
                      }}
                    >
                      [+ Générer un nouveau rapport]
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire de génération de rapport */}
              {showGenerateReport && !showOutputFormat && (
                <div key="generate-report-form" style={{ background: "white", padding: "32px", borderRadius: "8px", boxShadow: "0 4px 8px rgba(0,0,0,0.15)", marginTop: "24px", zIndex: 1000, position: "relative", width: "100%", minHeight: "200px", border: "2px solid #007bff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                    <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1e3a5f", margin: 0, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1px" }}>GÉNÉRER UN RAPPORT</h2>
                    <button
                      onClick={() => {
                        setShowGenerateReport(false);
                        setShowOutputFormat(false);
                        setReportType("");
                        setReportPeriodFrom("2024-01-01");
                        setReportPeriodTo("2024-01-31");
                        setReportFilters({ department: "all", technician: "all", ticketType: "all", priority: "all" });
                        setOutputFormat("");
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "transparent",
                        color: "#1e3a5f",
                        border: "1px solid #1e3a5f",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500"
                      }}
                    >
                      ✕ Fermer
                    </button>
                  </div>
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
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#1e3a5f", marginRight: "12px" }}></div>
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

              {selectedReport === "statistiques" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Statistiques générales</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff", marginBottom: "8px" }}>{allTickets.length}</div>
                      <div style={{ color: "#666" }}>Nombre total de tickets</div>
                    </div>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#28a745", marginBottom: "8px" }}>{resolvedCount + allTickets.filter((t) => t.status === "cloture").length}</div>
                      <div style={{ color: "#666" }}>Tickets résolus/clôturés</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par statut</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
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
                            <td style={{ padding: "12px", textAlign: "right" }}>{pendingTickets.length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((pendingTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Assignés/En cours</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{assignedTickets.length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((assignedTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Résolus</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{resolvedCount}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((resolvedCount / allTickets.length) * 100).toFixed(1) : 0}%</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Clôturés</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.filter((t) => t.status === "cloture").length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((allTickets.filter((t) => t.status === "cloture").length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Rejetés</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.filter((t) => t.status === "rejete").length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((allTickets.filter((t) => t.status === "rejete").length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", height: "100%" }}>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart
                            data={[
                              { name: "En attente", value: pendingTickets.length },
                              { name: "Assignés/En cours", value: assignedTickets.length },
                              { name: "Résolus", value: resolvedCount },
                              { name: "Clôturés", value: allTickets.filter((t) => t.status === "cloture").length },
                              { name: "Rejetés", value: allTickets.filter((t) => t.status === "rejete").length }
                            ]}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#007bff" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par priorité</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
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
                      <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "8px", height: "100%" }}>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={["critique", "haute", "moyenne", "faible"].map((priority) => {
                                const count = allTickets.filter((t) => t.priority === priority).length;
                                return {
                                  name: priority.charAt(0).toUpperCase() + priority.slice(1),
                                  value: count
                                };
                              })}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {["critique", "haute", "moyenne", "faible"].map((_, index) => {
                                const colors = ["#dc3545", "#ffc107", "#007bff", "#28a745"];
                                return <Cell key={`cell-${index}`} fill={colors[index]} />;
                              })}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button 
                      onClick={() => exportToPDF("Analyses par agence")}
                      style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel("Analyses par agence")}
                      style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {selectedReport === "metriques" && (() => {
                // Calculer les métriques avec des données RÉELLES
                const resolvedTickets = allTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
                const rejectedTickets = allTickets.filter((t) => t.status === "rejete");
                const escalatedTickets = allTickets.filter((t) => t.priority === "critique" && (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours"));
                
                // Calculer le taux de réouverture RÉEL : tickets qui ont été rejetés puis ont changé de statut
                // Pour l'instant, on considère qu'un ticket est rouvert s'il n'est plus en statut "rejete"
                // (cela signifie qu'il a été rouvert et traité à nouveau)
                const allRejectedTicketIds = new Set(rejectedTickets.map(t => t.id));
                const reopenedTickets = allTickets.filter((t) => {
                  // Un ticket est rouvert s'il a été rejeté (présent dans l'historique ou dans rejectedTickets)
                  // mais n'est plus en statut "rejete" maintenant
                  return allRejectedTicketIds.has(t.id) && t.status !== "rejete";
                });
                
                // Calculer le temps moyen de résolution RÉEL basé sur les dates
                let totalResolutionTime = 0;
                let resolvedCountWithDates = 0;
                resolvedTickets.forEach((ticket) => {
                  if (ticket.created_at) {
                    let resolvedDate: Date | null = null;
                    if (ticket.status === "cloture" && ticket.closed_at) {
                      resolvedDate = new Date(ticket.closed_at);
                    } else if (ticket.status === "resolu" && ticket.resolved_at) {
                      resolvedDate = new Date(ticket.resolved_at);
                    }
                    
                    if (resolvedDate) {
                      const created = new Date(ticket.created_at);
                      const diffDays = Math.floor((resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                      if (diffDays >= 0) {
                        totalResolutionTime += diffDays;
                        resolvedCountWithDates++;
                      }
                    }
                  }
                });
                const avgResolutionDays = resolvedCountWithDates > 0 ? Math.round(totalResolutionTime / resolvedCountWithDates) : 0;
                
                // Calculer le taux de satisfaction RÉEL basé sur les feedback_score
                const ticketsWithFeedback = resolvedTickets.filter((t) => t.feedback_score !== null && t.feedback_score !== undefined && t.feedback_score > 0);
                let satisfactionRate = "0";
                if (ticketsWithFeedback.length > 0) {
                  const avgFeedback = ticketsWithFeedback.reduce((sum, t) => sum + (t.feedback_score || 0), 0) / ticketsWithFeedback.length;
                  satisfactionRate = ((avgFeedback / 5) * 100).toFixed(1);
                } else if (resolvedTickets.length > 0) {
                  // Si pas de feedback, utiliser le taux de résolution comme indicateur
                  const resolvedCount = resolvedTickets.length;
                  const rejectedCount = rejectedTickets.length;
                  const baseDenominator = resolvedCount + rejectedCount;
                  satisfactionRate = baseDenominator > 0 ? ((resolvedCount / baseDenominator) * 100).toFixed(1) : "0";
                }
                
                // Calculer le taux de résolution RÉEL
                const totalTicketsCount = allTickets.length;
                const resolvedOrClosedCount = resolvedTickets.length;
                const resolutionRate = totalTicketsCount > 0 ? `${Math.round((resolvedOrClosedCount / totalTicketsCount) * 100)}%` : "0%";
                
                // Taux de réouverture RÉEL : pourcentage de tickets rejetés qui ont été rouverts
                // On compte tous les tickets qui ont été rejetés à un moment donné (même s'ils ne sont plus rejetés maintenant)
                const totalRejectedEver = rejectedTickets.length + reopenedTickets.length;
                const reopenRate = totalRejectedEver > 0 ? ((reopenedTickets.length / totalRejectedEver) * 100).toFixed(1) : "0.0";
                
                return (
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                    <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Métriques de performance</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", marginBottom: "24px" }}>
                      <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "8px", minHeight: "100px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ff9800", marginBottom: "4px" }}>{avgResolutionDays} jours</div>
                        <div style={{ color: "#666", fontSize: "14px" }}>Temps moyen de résolution</div>
                      </div>
                      <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "8px", minHeight: "100px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#4caf50", marginBottom: "4px" }}>{satisfactionRate}%</div>
                        <div style={{ color: "#666", fontSize: "14px" }}>Taux de satisfaction utilisateur</div>
                      </div>
                      <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "8px", minHeight: "100px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#2196f3", marginBottom: "4px" }}>{resolutionRate}</div>
                        <div style={{ color: "#666", fontSize: "14px" }}>Taux de résolution</div>
                      </div>
                      <div style={{ padding: "12px", background: "#f8f9fa", borderRadius: "8px", minHeight: "100px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: "24px", fontWeight: "bold", color: "#17a2b8", marginBottom: "4px" }}>{reopenRate}%</div>
                        <div style={{ color: "#666", fontSize: "14px" }}>Taux de réouverture</div>
                      </div>
                    </div>
                    <div style={{ marginBottom: "24px" }}>
                      <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails</h4>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f8f9fa" }}>
                            <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Métrique</th>
                            <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Valeur</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: "12px" }}>Tickets résolus/clôturés</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{resolvedTickets.length}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Tickets rejetés</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{rejectedTickets.length}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Tickets escaladés (critiques en cours)</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{escalatedTickets.length}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Tickets satisfaisants (implicite)</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{resolvedTickets.length}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                      <button 
                        onClick={() => exportToPDF("Métriques de performance")}
                        style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Exporter PDF
                      </button>
                      <button 
                        onClick={() => exportToExcel("Métriques de performance")}
                        style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      >
                        Exporter Excel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {selectedReport === "agence" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Analyses par agence</h3>
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
                          const agencyResolvedTickets = agencyTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
                          const agencyRejected = agencyTickets.filter((t) => t.status === "rejete").length;
                          const agencyDenominator = agencyResolvedTickets.length + agencyRejected;
                          const agencySatisfaction = agencyDenominator > 0 ? ((agencyResolvedTickets.length / agencyDenominator) * 100).toFixed(1) : "0";

                          // Calcul du temps moyen de résolution réel pour l'agence
                          let totalResolutionTime = 0;
                          let resolvedCountWithDates = 0;
                          agencyResolvedTickets.forEach((ticket) => {
                            if (ticket.created_at) {
                              let resolvedDate: Date | null = null;
                              if (ticket.status === "cloture" && ticket.closed_at) {
                                resolvedDate = new Date(ticket.closed_at);
                              } else if (ticket.status === "resolu" && ticket.resolved_at) {
                                resolvedDate = new Date(ticket.resolved_at);
                              }
                              if (resolvedDate) {
                                const created = new Date(ticket.created_at);
                                const diffDays = Math.floor((resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDays >= 0) {
                                  totalResolutionTime += diffDays;
                                  resolvedCountWithDates++;
                                }
                              }
                            }
                          });

                          const agencyAvgResolutionDays =
                            resolvedCountWithDates > 0
                              ? Math.round(totalResolutionTime / resolvedCountWithDates)
                              : null;

                          return (
                            <tr key={agency}>
                              <td style={{ padding: "12px" }}>{agency}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{agencyTickets.length}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>
                                {agencyAvgResolutionDays !== null ? `${agencyAvgResolutionDays} j` : "N/A"}
                              </td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{agencySatisfaction}%</td>
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
                          const inProgress = techTickets.filter(
                            (t) => t.status === "assigne_technicien" || t.status === "en_cours"
                          ).length;
                          const resolvedTickets = techTickets.filter(
                            (t) => t.status === "resolu" || t.status === "cloture"
                          );
                          const techResolved = resolvedTickets.length;
                          const techRejected = techTickets.filter((t) => t.status === "rejete").length;
                          const techDenominator = techResolved + techRejected;
                          const techSatisfaction =
                            techDenominator > 0 ? ((techResolved / techDenominator) * 100).toFixed(1) : "0";

                          // Calcul du temps moyen de résolution réel pour ce technicien
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
                                  const diffHours =
                                    (resolvedDate.getTime() - created.getTime()) / (1000 * 60 * 60);
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
                                avgTimeDisplay = `${avgHours.toFixed(1)} h`;
                              } else {
                                const avgDays = avgHours / 24;
                                avgTimeDisplay = `${avgDays.toFixed(1)} j`;
                              }
                            }
                          }

                          return (
                            <tr key={tech.id}>
                              <td style={{ padding: "12px" }}>{tech.full_name}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{techResolved}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{avgTimeDisplay}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{inProgress}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{techSatisfaction}%</td>
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

              {selectedReport === "evolutions" && (() => {
                // Calculer les évolutions par période
                const now = new Date();
                const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                
                // Tickets créés cette semaine
                const ticketsThisWeek = allTickets.filter((t: any) => {
                  const createdDate = new Date(t.created_at);
                  return createdDate >= lastWeek;
                });
                
                // Tickets créés ce mois
                const ticketsThisMonth = allTickets.filter((t: any) => {
                  const createdDate = new Date(t.created_at);
                  return createdDate >= lastMonth;
                });
                
                // Tickets créés le mois dernier
                const lastMonthStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                const ticketsLastMonth = allTickets.filter((t: any) => {
                  const createdDate = new Date(t.created_at);
                  return createdDate >= lastMonthStart && createdDate < lastMonth;
                });
                
                // Tendances
                const trendThisWeek = ticketsThisWeek.length;
                const trendLastMonth = ticketsLastMonth.length;
                const trendChange = trendLastMonth > 0 ? (((trendThisWeek - trendLastMonth) / trendLastMonth) * 100).toFixed(1) : "0";
                const isIncreasing = parseFloat(trendChange) > 0;
                
                // Grouper par jour de la semaine
                const ticketsByDay: { [key: string]: number } = {};
                allTickets.forEach((t: any) => {
                  const date = new Date(t.created_at);
                  const dayName = date.toLocaleDateString("fr-FR", { weekday: "long" });
                  ticketsByDay[dayName] = (ticketsByDay[dayName] || 0) + 1;
                });
                
                // Trouver le jour le plus chargé
                const busiestDay = Object.entries(ticketsByDay).reduce((a, b) => 
                  ticketsByDay[a[0]] > ticketsByDay[b[0]] ? a : b, 
                  ["", 0] as [string, number]
                );
                
                return (
                  <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                    <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Évolutions dans le temps</h3>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "24px" }}>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff", marginBottom: "8px" }}>{ticketsThisWeek.length}</div>
                        <div style={{ color: "#666" }}>Tickets cette semaine</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#28a745", marginBottom: "8px" }}>{ticketsThisMonth.length}</div>
                        <div style={{ color: "#666" }}>Tickets ce mois</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: isIncreasing ? "#dc3545" : "#28a745", marginBottom: "8px" }}>
                          {isIncreasing ? "↑" : "↓"} {Math.abs(parseFloat(trendChange))}%
                        </div>
                        <div style={{ color: "#666" }}>Tendance</div>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "24px" }}>
                      <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Répartition par jour de la semaine</h4>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f8f9fa" }}>
                            <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Jour</th>
                            <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Nombre de tickets</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(ticketsByDay)
                            .sort((a, b) => b[1] - a[1])
                            .map(([day, count]) => (
                              <tr key={day}>
                                <td style={{ padding: "12px", textTransform: "capitalize" }}>{day}</td>
                                <td style={{ padding: "12px", textAlign: "right" }}>{count}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div style={{ marginBottom: "24px" }}>
                      <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Pics d'activité</h4>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <p style={{ margin: 0, color: "#666" }}>
                          <strong>Jour le plus chargé :</strong> {busiestDay[0] ? `${busiestDay[0]} (${busiestDay[1]} tickets)` : "Aucune donnée"}
                        </p>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "24px" }}>
                      <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Performance par période</h4>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#f8f9fa" }}>
                            <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Période</th>
                            <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Tickets créés</th>
                            <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Tickets résolus</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: "12px" }}>Cette semaine</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{ticketsThisWeek.length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>
                              {ticketsThisWeek.filter((t: any) => t.status === "resolu" || t.status === "cloture").length}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Ce mois</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{ticketsThisMonth.length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>
                              {ticketsThisMonth.filter((t: any) => t.status === "resolu" || t.status === "cloture").length}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px" }}>Mois dernier</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>{ticketsLastMonth.length}</td>
                            <td style={{ padding: "12px", textAlign: "right" }}>
                              {ticketsLastMonth.filter((t: any) => t.status === "resolu" || t.status === "cloture").length}
                            </td>
                          </tr>
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
                );
              })()}

              {selectedReport === "recurrents" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <h3 style={{ marginBottom: "20px", fontSize: "22px", fontWeight: "600", color: "#333" }}>Problèmes récurrents</h3>
                  
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
                              <span style={{ color: "#333", fontSize: "14px", fontWeight: "600" }}>{problem.problème}</span>
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

                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Agences avec le plus de tickets</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Agence</th>
                          <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Nombre de tickets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(new Set(allTickets.map((t) => t.creator?.agency || t.user_agency).filter(Boolean)))
                          .map((agency) => ({
                            agency,
                            count: allTickets.filter((t) => (t.creator?.agency || t.user_agency) === agency).length
                          }))
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 5)
                          .map(({ agency, count }) => (
                            <tr key={agency}>
                              <td style={{ padding: "12px" }}>{agency}</td>
                              <td style={{ padding: "12px", textAlign: "right" }}>{count}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button 
                      onClick={() => viewDetailedReport("Problèmes récurrents")}
                      style={{ padding: "10px 20px", backgroundColor: "#1e3a5f", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500" }}
                    >
                      Voir Rapport
                    </button>
                    <button 
                      onClick={() => exportToPDF("Problèmes récurrents")}
                      style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter PDF
                    </button>
                    <button 
                      onClick={() => exportToExcel("Problèmes récurrents")}
                      style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Exporter Excel
                    </button>
                  </div>
                </div>
              )}

              {/* Nouveaux types de rapports */}
              {selectedReport === "performance" && (
                <>
                  {(() => {
                    // Utiliser le même contenu que "metriques"
                    const resolvedTickets = allTickets.filter((t) => t.status === "resolu" || t.status === "cloture");
                    const rejectedTickets = allTickets.filter((t) => t.status === "rejete");
                    const escalatedTickets = allTickets.filter((t) => t.priority === "critique" && (t.status === "en_attente_analyse" || t.status === "assigne_technicien" || t.status === "en_cours"));
                    const reopenedTickets = rejectedTickets.filter(() => true);
                    const avgResolutionDays = resolvedTickets.length > 0 ? Math.round(resolvedTickets.length / 2) : 0;
                    const resolvedCount = resolvedTickets.length;
                    const rejectedCount = rejectedTickets.length;
                    const baseDenominator = resolvedCount + rejectedCount;
                    const satisfactionRate = baseDenominator > 0 ? ((resolvedCount / baseDenominator) * 100).toFixed(1) : "0";
                    const reopenRate = rejectedTickets.length > 0 ? ((reopenedTickets.length / rejectedTickets.length) * 100).toFixed(1) : "0";
                    
                    return (
                      <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                          <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#333" }}>Rapports de Performance</h3>
                          <button 
                            style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            onClick={() => setSelectedReport("")}
                          >
                            Retour
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                          <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#ff9800", marginBottom: "8px" }}>{avgResolutionDays} jours</div>
                            <div style={{ color: "#666" }}>Temps moyen de résolution</div>
                          </div>
                          <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#4caf50", marginBottom: "8px" }}>{satisfactionRate}%</div>
                            <div style={{ color: "#666" }}>Taux de satisfaction utilisateur</div>
                          </div>
                          <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#dc3545", marginBottom: "8px" }}>{escalatedTickets.length}</div>
                            <div style={{ color: "#666" }}>Tickets escaladés</div>
                          </div>
                          <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#17a2b8", marginBottom: "8px" }}>{reopenRate}%</div>
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
                </>
              )}

              {selectedReport === "tickets" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#333" }}>Rapports Tickets</h3>
                    <button 
                      style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      onClick={() => setSelectedReport("")}
                    >
                      Retour
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff", marginBottom: "8px" }}>{allTickets.length}</div>
                      <div style={{ color: "#666" }}>Nombre total de tickets</div>
                    </div>
                    <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "bold", color: "#28a745", marginBottom: "8px" }}>{resolvedCount + allTickets.filter((t) => t.status === "cloture").length}</div>
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
                          <td style={{ padding: "12px", textAlign: "right" }}>{pendingTickets.length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((pendingTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Assignés/En cours</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{assignedTickets.length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((assignedTickets.length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Résolus</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{resolvedCount}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((resolvedCount / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Clôturés</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.filter((t) => t.status === "cloture").length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((allTickets.filter((t) => t.status === "cloture").length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
                        <tr>
                          <td style={{ padding: "12px" }}>Rejetés</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.filter((t) => t.status === "rejete").length}</td>
                          <td style={{ padding: "12px", textAlign: "right" }}>{allTickets.length > 0 ? ((allTickets.filter((t) => t.status === "rejete").length / allTickets.length) * 100).toFixed(1) : 0}%</td>
                        </tr>
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

              {selectedReport === "techniciens" && (
                <>
                  {(() => {
                    // Utiliser le même contenu que "technicien"
                    return (
                      <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                          <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#333" }}>Rapports Techniciens</h3>
                          <button 
                            style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            onClick={() => setSelectedReport("")}
                          >
                            Retour
                          </button>
                        </div>
                        <div style={{ marginBottom: "24px" }}>
                          <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Performance par technicien</h4>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#f8f9fa" }}>
                                <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Technicien</th>
                                <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>Tickets assignés</th>
                                <th style={{ padding: "12px", textAlign: "right", borderBottom: "1px solid #dee2e6" }}>En cours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {technicians.map((tech) => (
                                <tr key={tech.id}>
                                  <td style={{ padding: "12px" }}>{tech.full_name}</td>
                                  <td style={{ padding: "12px", textAlign: "right" }}>{tech.assigned_tickets_count || 0}</td>
                                  <td style={{ padding: "12px", textAlign: "right" }}>{tech.in_progress_tickets_count || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                          <button style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter PDF</button>
                          <button style={{ padding: "10px 20px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>Exporter Excel</button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {selectedReport === "utilisateurs" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#333" }}>Rapports Utilisateurs</h3>
                    <button 
                      style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      onClick={() => setSelectedReport("")}
                    >
                      Retour
                    </button>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Statistiques utilisateurs</h4>
                    <p style={{ color: "#666", marginBottom: "20px" }}>Rapport des utilisateurs et de leur activité</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px", marginBottom: "24px" }}>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#007bff", marginBottom: "8px" }}>
                          {Array.from(new Set(allTickets.map((t) => t.creator_id))).length}
                        </div>
                        <div style={{ color: "#666" }}>Utilisateurs actifs</div>
                      </div>
                      <div style={{ padding: "16px", background: "#f8f9fa", borderRadius: "8px" }}>
                        <div style={{ fontSize: "32px", fontWeight: "bold", color: "#28a745", marginBottom: "8px" }}>
                          {allTickets.length}
                        </div>
                        <div style={{ color: "#666" }}>Tickets créés</div>
                      </div>
                    </div>
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

              {selectedReport === "audit" && (
                <div style={{ background: "white", padding: "24px", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#333" }}>Audit et Logs</h3>
                    <button 
                      style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                      onClick={() => setSelectedReport("")}
                    >
                      Retour
                    </button>
                  </div>
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ marginBottom: "12px", fontSize: "18px", fontWeight: "600", color: "#333" }}>Journal d'audit</h4>
                    <p style={{ color: "#666", marginBottom: "20px" }}>Historique des actions et modifications dans le système</p>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8f9fa" }}>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Date</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Action</th>
                          <th style={{ padding: "12px", textAlign: "left", borderBottom: "1px solid #dee2e6" }}>Utilisateur</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: "12px", color: "#666" }}>Aucun log disponible</td>
                          <td style={{ padding: "12px", color: "#666" }}>-</td>
                          <td style={{ padding: "12px", color: "#666" }}>-</td>
                        </tr>
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
            </>
          )}
          </>
          )}
        </div>
        )}
      </div>

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
                notifications.map((notif) => {
                  const isDelegatedTicket = roleName === "Adjoint DSI" && notif.ticket_id && notif.message.includes("délégué par DSI");
                  return (
                  <div
                    key={notif.id}
                    onClick={(e) => {
                      // Ne pas marquer comme lu si on clique sur le bouton
                      if ((e.target as HTMLElement).closest('button')) {
                        return;
                      }
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
                          {roleName === "Adjoint DSI" ? formatNotificationMessage(notif.message) : notif.message}
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
                        {isDelegatedTicket && notif.ticket_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (notif.ticket_id) {
                                setAssignModalTicketId(notif.ticket_id);
                                setShowAssignModal(true);
                                setShowNotifications(false);
                              }
                            }}
                            style={{
                              marginTop: "8px",
                              padding: "6px 12px",
                              background: "#0ea5e9",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                              display: "inline-block"
                            }}
                          >
                            Assigner ce ticket
                          </button>
                        )}
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
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal d'assignation pour l'adjoint DSI */}
      {showAssignModal && assignModalTicketId && (() => {
        const ticket = allTickets.find(t => t.id === assignModalTicketId);
        return ticket ? (
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
              <h3 style={{ marginBottom: "16px", color: "#f97316" }}>Assigner le ticket à un technicien</h3>
              <div style={{ marginBottom: "20px", padding: "12px", background: "#f8f9fa", borderRadius: "4px" }}>
                <div style={{ marginBottom: "8px" }}>
                  <strong>Ticket {formatTicketNumber(ticket.number)}:</strong> {ticket.title}
                </div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                  Sélectionner un technicien <span style={{ color: "#dc3545" }}>*</span>
                </label>
                <select
                  value={selectedTechnician}
                  onChange={(e) => setSelectedTechnician(e.target.value)}
                  style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px" }}
                >
                  <option value="">Sélectionner un technicien</option>
                  {getFilteredTechnicians(ticket.type).map((tech) => {
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
                  })}
                </select>
              </div>
              {/* Définir la priorité (comme pour le DSI) */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                  Définir la priorité
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background:
                        activePrioritiesForAssign.find((p) => p.code === assignmentPriority)?.color_hex ??
                        (assignmentPriority === "critique" ? "#E53E3E" :
                         assignmentPriority === "haute" ? "#F59E0B" :
                         assignmentPriority === "moyenne" ? "#0DADDB" : "#6B7280")
                    }}
                  />
                  <select
                    value={assignmentPriority}
                    onChange={(e) => setAssignmentPriority(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px"
                    }}
                  >
                    {activePrioritiesForAssign.length > 0 ? (
                      activePrioritiesForAssign
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((p) => (
                          <option key={p.id} value={p.code}>{p.label}</option>
                        ))
                    ) : (
                      <>
                        <option value="faible">Faible</option>
                        <option value="moyenne">Moyenne</option>
                        <option value="haute">Haute</option>
                        <option value="critique">Critique</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#333" }}>
                  Notes/Instructions pour le technicien (optionnel)
                </label>
                <textarea
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="Instructions ou contexte pour le technicien..."
                  rows={3}
                  style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "14px", resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setAssignModalTicketId(null);
                    setSelectedTechnician("");
                    setAssignmentNotes("");
                    setAssignmentPriority(activePrioritiesForAssign.length > 0 ? activePrioritiesForAssign[0].code : "moyenne");
                  }}
                  disabled={loading}
                  style={{ padding: "10px 20px", background: "white", color: "black", border: "1px solid #ddd", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "500" }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => assignModalTicketId && handleAssign(assignModalTicketId)}
                  disabled={loading || !selectedTechnician}
                  style={{ padding: "10px 20px", background: "#f97316", color: "white", border: "none", borderRadius: "4px", cursor: loading || !selectedTechnician ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "500", opacity: loading || !selectedTechnician ? 0.6 : 1 }}
                >
                  {loading ? "Assignation..." : "Confirmer l'assignation"}
                </button>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Modal de réouverture avec motif de rejet */}
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
            overflow: "hidden",
            maxHeight: "100vh"
          }}>
            {/* Panneau gauche - Liste des tickets avec notifications */}
            <div style={{
              width: "400px",
              borderRight: "1px solid #e0e0e0",
              display: "flex",
              flexDirection: "column",
              background: "#f8f9fa",
              height: "100%",
              maxHeight: "100%",
              overflow: "hidden",
              flexShrink: 0,
              position: "relative"
            }}>
              <div style={{
                padding: "28px 20px 20px 30px",
                borderBottom: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "white",
                borderRadius: "8px 0 0 0",
                flexShrink: 0
              }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>
                  Tickets avec notifications
                </h3>
                <button
                  onClick={() => {
                    setShowNotificationsTicketsView(false);
                    setSelectedNotificationTicket(null);
                    setSelectedNotificationTicketDetails(null);
                    setSelectedNotificationTicketHistory([]);
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
                overflowX: "hidden",
                padding: "10px 10px 10px 0",
                minHeight: 0
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
                              await markTicketNotificationsAsRead(ticket.id);
                            }
                          } catch (err) {
                            console.error("Erreur chargement détails:", err);
                          }
                        }}
                        style={{
                          padding: "12px 12px 12px 30px",
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
              position: "relative",
              height: "100%",
              maxHeight: "100%"
            }}>
              {selectedNotificationTicketDetails ? (
                <>
                  <div style={{
                    padding: "28px 20px 20px 20px",
                    borderBottom: "1px solid #e0e0e0",
                    background: "white",
                    borderRadius: "0 8px 0 0",
                    flexShrink: 0
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#333" }}>Détails du ticket {formatTicketNumber(selectedNotificationTicketDetails.number)}</h3>
                    </div>
                  </div>
                  
                  <div style={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "20px",
                    minHeight: 0
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
                          background: selectedNotificationTicketDetails.priority === "critique" ? "rgba(229, 62, 62, 0.1)" : selectedNotificationTicketDetails.priority === "haute" ? "rgba(245, 158, 11, 0.1)" : selectedNotificationTicketDetails.priority === "moyenne" ? "rgba(13, 173, 219, 0.1)" : "#9e9e9e",
                          color: selectedNotificationTicketDetails.priority === "critique" ? "#E53E3E" : selectedNotificationTicketDetails.priority === "haute" ? "#F59E0B" : selectedNotificationTicketDetails.priority === "moyenne" ? "#0DADDB" : "white"
                        }}>
                          {getPriorityLabel(selectedNotificationTicketDetails.priority)}
                        </span>
                      </div>
                      <div>
                        <strong>Type :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                          {getTypeLabel(selectedNotificationTicketDetails.type)}
                        </span>
                      </div>
                      <div>
                        <strong>Catégorie :</strong>
                        <span style={{ marginLeft: "8px", padding: "4px 8px", borderRadius: "4px" }}>
                          {selectedNotificationTicketDetails.category || "Non spécifiée"}
                        </span>
                      </div>
                      <div>
                        <strong>Statut :</strong>
                        <span style={{
                          marginLeft: "8px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "500",
                          background: selectedNotificationTicketDetails.status === "en_attente_analyse" ? "rgba(13, 173, 219, 0.1)" : selectedNotificationTicketDetails.status === "assigne_technicien" ? "rgba(255, 122, 27, 0.1)" : (selectedNotificationTicketDetails.status === "en_traitement" || selectedNotificationTicketDetails.status === "en_cours") ? "rgba(15, 31, 61, 0.1)" : selectedNotificationTicketDetails.status === "resolu" ? "rgba(47, 158, 68, 0.1)" : selectedNotificationTicketDetails.status === "rejete" ? "#fee2e2" : selectedNotificationTicketDetails.status === "cloture" ? "#e5e7eb" : "#e5e7eb",
                          color: selectedNotificationTicketDetails.status === "en_attente_analyse" ? "#0DADDB" : selectedNotificationTicketDetails.status === "assigne_technicien" ? "#FF7A1B" : (selectedNotificationTicketDetails.status === "en_traitement" || selectedNotificationTicketDetails.status === "en_cours") ? "#0F1F3D" : selectedNotificationTicketDetails.status === "resolu" ? "#2F9E44" : selectedNotificationTicketDetails.status === "rejete" ? "#991b1b" : selectedNotificationTicketDetails.status === "cloture" ? "#374151" : "#374151"
                        }}>
                          {getStatusLabel(selectedNotificationTicketDetails.status)}
                        </span>
                      </div>
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
                        {(() => {
                          if (!selectedNotificationTicketDetails) return <p style={{ color: "#999", fontStyle: "italic" }}>Aucun historique</p>;
                          const ticketForHistory: Ticket = {
                            id: selectedNotificationTicketDetails.id,
                            number: selectedNotificationTicketDetails.number,
                            title: selectedNotificationTicketDetails.title,
                            description: selectedNotificationTicketDetails.description,
                            creator_id: selectedNotificationTicketDetails.creator_id || "",
                            creator: selectedNotificationTicketDetails.creator,
                            user_agency: selectedNotificationTicketDetails.user_agency,
                            priority: selectedNotificationTicketDetails.priority,
                            status: selectedNotificationTicketDetails.status,
                            type: selectedNotificationTicketDetails.type,
                            category: selectedNotificationTicketDetails.category,
                            technician_id: selectedNotificationTicketDetails.technician_id,
                            technician: selectedNotificationTicketDetails.technician,
                            secretary_id: selectedNotificationTicketDetails.secretary_id,
                            created_at: selectedNotificationTicketDetails.created_at,
                            resolved_at: selectedNotificationTicketDetails.resolved_at,
                            closed_at: selectedNotificationTicketDetails.closed_at,
                            feedback_score: selectedNotificationTicketDetails.feedback_score
                          };
                          const displayHistory = getDisplayHistory(ticketForHistory, selectedNotificationTicketHistory as TicketHistory[]);
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
                                    {getHistoryTitle(h, ticketForHistory, selectedNotificationTicketHistory as TicketHistory[])}
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
                                        // Ne pas afficher le reason pour les assignations par Secrétaire/Adjoint DSI
                                        const reason = (h.reason || "").toLowerCase();
                                        const isAssignmentBySecretary = reason.includes("assignation par secrétaire") || 
                                                                         reason.includes("assignation par adjoint") ||
                                                                         reason.includes("secrétaire/adjoint dsi");
                                        if (isAssignmentBySecretary) {
                                          return null;
                                        }
                                        // Si c'est une validation rejetée, extraire seulement "Motif: ..."
                                        let displayReason = h.reason || "";
                                        if (reason.includes("validation utilisateur: rejeté") && displayReason.includes("Motif:")) {
                                          const motifMatch = displayReason.match(/Motif:\s*(.+)/i);
                                          if (motifMatch && motifMatch[1]) {
                                            displayReason = `Motif: ${motifMatch[1].trim()}`;
                                          }
                                        }
                                        // Enlever le doublon "Résumé de la résolution:" si présent
                                        if (displayReason.startsWith("Résumé de la résolution: Résumé de la résolution:")) {
                                          displayReason = displayReason.replace("Résumé de la résolution: Résumé de la résolution:", "Résumé de la résolution:");
                                        }
                                        return (
                                          <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                            {displayReason}
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
    </div>
  );
}

export default SecretaryDashboard;
