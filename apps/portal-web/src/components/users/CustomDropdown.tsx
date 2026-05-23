'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

interface Action {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface CustomDropdownProps {
  actions: Action[];
}

export function CustomDropdown({ actions }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="static" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-5 w-5 text-gray-500" />
      </button>
      {isOpen && (
        <div
          className="fixed w-48 rounded-2xl shadow-lg bg-white ring-1 ring-black ring-opacity-5"
          style={{
            top: dropdownRef.current
              ? dropdownRef.current.getBoundingClientRect().bottom + 8
              : 0,
            left: dropdownRef.current
              ? dropdownRef.current.getBoundingClientRect().right - 192
              : 0,
            zIndex: 9998,
          }}
        >
          <div
            className="p-2"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="options-menu"
          >
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  if (!action.disabled) {
                    action.onClick();
                    setIsOpen(false);
                  }
                }}
                className={`flex items-center w-full px-4 py-2 my-2 text-sm gap-3 ${
                  action.disabled
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
                role="menuitem"
                disabled={action.disabled}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
