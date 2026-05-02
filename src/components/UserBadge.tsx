// components/UserBadge.tsx
import { Gem } from "lucide-react";

const BADGE_CONFIG: Record<string, { icon: React.ReactNode; label: string; className: string; style?: React.CSSProperties }> = {
  early_supporter: {
    icon: <Gem size={14} strokeWidth={2} />,
    label: "Early Supporter",
    className: "",
    style: { color: '#E6FF3D' },
  },
};

interface UserBadgeProps {
  badge?: string | null;
  displayName: string;
  className?: string;
}

export function UserBadge({ badge, displayName, className = "" }: UserBadgeProps) {
  const config = badge ? BADGE_CONFIG[badge] : null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {config && (
        <span
          className={`${config.className} flex-shrink-0`}
          style={config.style}
          title={config.label}
        >
          {config.icon}
        </span>
      )}
      {displayName}
    </span>
  );
}