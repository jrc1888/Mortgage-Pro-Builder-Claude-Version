import React from 'react';
import { Home as HomeIcon } from 'lucide-react';

interface Props {
  onNavigateHome: () => void;
  title?: string;
  userEmail?: string | null;
  variant?: 'light' | 'dark';
  rightActions?: React.ReactNode; // For buttons like "New Scenario"
  leftContent?: React.ReactNode; // For additional content on the left (e.g., sync indicator)
}

export const SharedHeader: React.FC<Props> = ({ onNavigateHome, title, userEmail, variant = 'dark', rightActions, leftContent }) => {
  const isDark = variant === 'dark';
  
  return (
    <header className={`${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} border-b px-6 py-3 flex items-center justify-between shrink-0 h-[6.4rem] relative z-30 shadow-md w-full`}>
      <div className="flex items-center gap-5 flex-1 min-w-0">
        {/* MortgagePro Home Button - Exact positioning match from ScenarioBuilder */}
        <button
          onClick={onNavigateHome}
          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors group shrink-0 w-72 ${
            isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-50'
          }`}
        >
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
            <HomeIcon className="w-7 h-7 text-white" />
          </div>
          <span className={`text-2xl font-bold group-hover:text-indigo-400 transition-colors ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            MortgagePro
          </span>
        </button>
        {leftContent && (
          <div className="flex items-center gap-2">
            {leftContent}
          </div>
        )}
        {title && (
          <>
            <div className={`h-10 w-px shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
            <div className="flex flex-col justify-center min-w-0">
              <h1 className={`text-3xl font-black tracking-tight truncate ${
                isDark ? 'text-indigo-400' : 'text-slate-900'
              }`}>{title}</h1>
            </div>
          </>
        )}
      </div>
      <div className={`flex items-center gap-4 shrink-0 ${rightActions ? 'ml-4 pl-8 border-l border-slate-800/50' : ''}`}>
        {rightActions}
        {userEmail && (
          <div className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {userEmail}
          </div>
        )}
      </div>
    </header>
  );
};

