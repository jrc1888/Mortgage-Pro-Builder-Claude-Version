import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  MessageSquare, 
  FileText, 
  BarChart3, 
  Users, 
  Settings,
  Star,
  LogOut,
  Home as HomeIcon
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface Application {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  available: boolean;
  comingSoon?: boolean;
}

interface Props {
  onNavigate: (appId: string) => void;
  onLogout: () => void;
  userEmail?: string | null;
}

export const Home: React.FC<Props> = ({ onNavigate, onLogout, userEmail }) => {
  const [starredApp, setStarredApp] = useState<string | null>(() => {
    return localStorage.getItem('mortgagepro_starred_app');
  });

  const applications: Application[] = [
    {
      id: 'scenario-builder',
      name: 'Scenario Builder',
      description: 'Build and analyze mortgage scenarios for clients',
      icon: <Calculator className="w-12 h-12" />,
      route: 'scenario-builder',
      available: true
    },
    {
      id: 'updates',
      name: 'Client Updates',
      description: 'Send text and email updates to clients as loans progress',
      icon: <MessageSquare className="w-12 h-12" />,
      route: 'updates',
      available: true
    },
    {
      id: 'document-manager',
      name: 'Document Manager',
      description: 'Organize and manage loan documents and files',
      icon: <FileText className="w-12 h-12" />,
      route: 'documents',
      available: false,
      comingSoon: true
    },
    {
      id: 'analytics',
      name: 'Analytics Dashboard',
      description: 'Track pipeline metrics, conversion rates, and performance',
      icon: <BarChart3 className="w-12 h-12" />,
      route: 'analytics',
      available: false,
      comingSoon: true
    },
    {
      id: 'crm',
      name: 'Client CRM',
      description: 'Manage client relationships, notes, and communication history',
      icon: <Users className="w-12 h-12" />,
      route: 'crm',
      available: false,
      comingSoon: true
    },
    {
      id: 'settings',
      name: 'Settings & Preferences',
      description: 'Configure platform settings, templates, and integrations',
      icon: <Settings className="w-12 h-12" />,
      route: 'settings',
      available: false,
      comingSoon: true
    }
  ];

  const handleStar = (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStarred = starredApp === appId ? null : appId;
    setStarredApp(newStarred);
    if (newStarred) {
      localStorage.setItem('mortgagepro_starred_app', newStarred);
    } else {
      localStorage.removeItem('mortgagepro_starred_app');
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0 h-[6.4rem] relative z-30 shadow-md w-full">
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <div className="flex items-center gap-3 px-4 py-2 shrink-0 w-72">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
              <HomeIcon className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">MortgagePro</span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {userEmail && (
            <div className="text-sm font-medium text-slate-400">
              {userEmail}
            </div>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Applications</h2>
            <p className="text-slate-600">Select an application to get started</p>
          </div>

          {/* Application Grid - 2 rows, 3 columns */}
          <div className="grid grid-cols-3 gap-6">
            {applications.map((app) => (
              <div
                key={app.id}
                onClick={() => app.available && onNavigate(app.route)}
                className={`
                  relative bg-white rounded-xl border-2 transition-all cursor-pointer
                  ${app.available 
                    ? 'border-slate-200 hover:border-indigo-300 hover:shadow-lg shadow-sm' 
                    : 'border-slate-100 opacity-60 cursor-not-allowed'
                  }
                `}
              >
                {/* Star Button */}
                <button
                  onClick={(e) => handleStar(app.id, e)}
                  className={`
                    absolute top-4 right-4 p-2 rounded-lg transition-all z-10
                    ${starredApp === app.id
                      ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    }
                  `}
                >
                  <Star 
                    size={18} 
                    className={starredApp === app.id ? 'fill-current' : ''}
                  />
                </button>

                {/* Application Content */}
                <div className="p-8">
                  <div className={`
                    w-16 h-16 rounded-xl flex items-center justify-center mb-4
                    ${app.available
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                    }
                  `}>
                    {app.icon}
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{app.name}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{app.description}</p>
                  
                  {app.comingSoon && (
                    <div className="mt-4 inline-block px-3 py-1 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full">
                      Coming Soon
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

