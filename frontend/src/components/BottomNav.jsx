import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Bell, FolderHeart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function BottomNav() {
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const location  = useLocation();

  const links = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('dashboard')  },
    { to: '/patients',  icon: Users,           label: t('patients')   },
    { to: '/reports',   icon: FolderHeart,     label: t('reports')    },
    { to: '/reminders', icon: Bell,            label: t('reminders')  },
  ];

  const handleNav = (to) => {
    navigate(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-100 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-2 pt-2 pb-2">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <button
              key={to}
              onClick={() => handleNav(to)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`
                flex flex-col items-center justify-center gap-1.5
                flex-1 py-1.5 px-1 rounded-xl
                transition-colors duration-150
                touch-manipulation select-none
                ${isActive
                  ? 'text-primary'
                  : 'text-slate-400 hover:text-slate-600 active:text-slate-700'
                }
              `}
            >
              {/* Icon — same size active & inactive */}
              <Icon
                size={22}
                strokeWidth={isActive ? 2.25 : 1.75}
              />

              {/* Label — uniform size, weight, spacing */}
              <span
                className={`
                  text-[13px] leading-tight tracking-normal font-body
                  ${isActive ? 'font-semibold' : 'font-medium'}
                `}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
