import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  noPadding?: boolean;
  positionTop?: boolean; // If true, positions modal at top of screen instead of center
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  children, 
  maxWidth = 'max-w-lg',
  noPadding = false,
  positionTop = false
}) => {
  if (!isOpen) return null;

  // Handle Escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const modalContent = (
    <div className={`fixed inset-0 bg-slate-900/60 z-[100] flex ${positionTop ? 'items-start justify-center pt-4' : 'items-center justify-center'} ${positionTop ? 'p-4' : 'p-4'} backdrop-blur-sm animate-fadeIn`}>
      <div 
        className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} overflow-hidden transform transition-all border border-slate-300 flex flex-col ${positionTop ? 'h-[calc(100vh-2rem)]' : 'max-h-[90vh]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 font-medium">{subtitle}</p>}
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className={`${positionTop && noPadding ? 'flex-1 min-h-0 flex flex-col' : 'overflow-y-auto'} ${noPadding ? '' : 'p-6'}`}>
          {children}
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level to avoid parent container constraints
  return isOpen ? createPortal(modalContent, document.body) : null;
};
