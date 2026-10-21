import {
  AlertTriangle, ArrowRight, Bell, Book, Briefcase, Calendar, Check, Clock, DollarSign, Download, Edit3,
  ExternalLink, File, Filter, Flag, Folder, Gift, Heart, Home, Inbox, Info, Layers, Lock, Mail, Map,
  MessageSquare, Phone, Plus, Search, Settings, Shield, Sparkles, Star, Target, Trash2, Upload, User,
  Users, Zap, BarChart3, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home, inbox: Inbox, calendar: Calendar, clock: Clock, file: File, folder: Folder, search: Search,
  settings: Settings, user: User, users: Users, bell: Bell, chart: BarChart3, dollar: DollarSign, heart: Heart,
  star: Star, check: Check, alert: AlertTriangle, info: Info, plus: Plus, edit: Edit3, trash: Trash2,
  download: Download, upload: Upload, filter: Filter, "arrow-right": ArrowRight, external: ExternalLink,
  mail: Mail, phone: Phone, map: Map, lock: Lock, sparkles: Sparkles, book: Book, flag: Flag, target: Target,
  gift: Gift, layers: Layers, message: MessageSquare, shield: Shield, zap: Zap, briefcase: Briefcase,
};

/** Renders an allowlisted icon; unknown names render nothing. */
export function Icon({ name, size = 16, className }: { name?: string; size?: number; className?: string }) {
  const I = name ? ICONS[name] : undefined;
  return I ? <I size={size} className={className} aria-hidden="true" strokeWidth={1.9} /> : null;
}
