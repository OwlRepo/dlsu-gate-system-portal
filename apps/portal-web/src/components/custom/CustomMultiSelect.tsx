// "use client"

// import type React from "react"
// import { useState, useRef, useEffect, type KeyboardEvent } from "react"
// import { ChevronDown, X, Search, Check } from "lucide-react"

// export type Option = {
//   value: string
//   label: string
//   [key: string]: any
// }

// export interface CustomMultiSelectProps {
//   options: Option[]
//   value?: string[]
//   defaultValue?: string[]
//   onChange?: (values: string[]) => void
//   placeholder?: string
//   emptyMessage?: string
//   description?: string
//   disabled?: boolean
//   className?: string,
//   label?: string
// }

// export function CustomMultiSelect({
//   options,
//   value,
//   defaultValue = [],
//   onChange,
//   placeholder = "Select options...",
//   emptyMessage = "No options found.",
//   label,
//   description,
//   disabled = false,
//   className = "",
// }: CustomMultiSelectProps) {
//   // State for dropdown open/close
//   const [isOpen, setIsOpen] = useState(false)

//   // State for search input
//   const [searchTerm, setSearchTerm] = useState("")

//   // State for selected values (for uncontrolled component)
//   const [selectedValues, setSelectedValues] = useState<string[]>(defaultValue)

//   // Handle controlled component
//   const values = value !== undefined ? value : selectedValues

//   // Refs for DOM elements
//   const containerRef = useRef<HTMLDivElement>(null)
//   const searchInputRef = useRef<HTMLInputElement>(null)

//   // Filter options based on search term
//   const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(searchTerm.toLowerCase()))

//   // Handle selection of an option
//   const handleSelect = (optionValue: string) => {
//     const newValues = values.includes(optionValue)
//       ? values.filter((val) => val !== optionValue)
//       : [...values, optionValue]

//     // Update internal state for uncontrolled component
//     if (value === undefined) {
//       setSelectedValues(newValues)
//     }

//     // Call onChange handler if provided
//     onChange?.(newValues)
//   }

//   // Handle removal of a selected option
//   const handleRemove = (optionValue: string, e?: React.MouseEvent) => {
//     e?.stopPropagation()

//     const newValues = values.filter((val) => val !== optionValue)

//     // Update internal state for uncontrolled component
//     if (value === undefined) {
//       setSelectedValues(newValues)
//     }

//     // Call onChange handler if provided
//     onChange?.(newValues)
//   }

//   // Handle keyboard navigation
//   const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
//     switch (e.key) {
//       case "Escape":
//         setIsOpen(false)
//         break
//       case "ArrowDown":
//         if (!isOpen) {
//           setIsOpen(true)
//         }
//         break
//       case "Backspace":
//         if (!searchTerm && values.length > 0) {
//           handleRemove(values[values.length - 1])
//         }
//         break
//     }
//   }

//   // Focus search input when dropdown opens
//   useEffect(() => {
//     if (isOpen && searchInputRef.current) {
//       searchInputRef.current.focus()
//     }
//   }, [isOpen])

//   // Close dropdown when clicking outside
//   useEffect(() => {
//     const handleClickOutside = (e: MouseEvent) => {
//       if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
//         setIsOpen(false)
//       }
//     }

//     document.addEventListener("mousedown", handleClickOutside)
//     return () => {
//       document.removeEventListener("mousedown", handleClickOutside)
//     }
//   }, [])

//   return (
//     <div className={`space-y-2 ${className}`}>
//       {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}

//       <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
//         {/* Main input area */}
//         <div
//           className={`
//             flex flex-wrap items-center gap-1 p-2 border rounded-md min-h-[42px] 
//             ${isOpen ? "border-primary ring-1 ring-primary" : "border-input"} 
//             ${disabled ? "bg-muted opacity-50 cursor-not-allowed" : "bg-background cursor-pointer"}
//             transition-all duration-200
//           `}
//           onClick={() => !disabled && setIsOpen(!isOpen)}
//         >
//           {/* Selected items */}
//           {values.length > 0 ? (
//             <div className="flex flex-wrap gap-1">
//               {values.map((val, index) => {
//                 const option = options.find((opt) => opt.value || opt.id === val)
//                 return (
//                   <span
//                     key={index}
//                     className="
//                       flex items-center gap-1 px-2 py-1 text-xs rounded-md
//                       bg-secondary text-secondary-foreground
//                     "
//                   >
//                     {option?.label}
//                     <button
//                       type="button"
//                       onClick={(e) => handleRemove(val, e)}
//                       disabled={disabled}
//                       className="text-secondary-foreground/70 hover:text-secondary-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-full"
//                       aria-label={`Remove ${option?.label}`}
//                     >
//                       <X size={14} />
//                     </button>
//                   </span>
//                 )
//               })}
//             </div>
//           ) : (
//             <span className="text-muted-foreground">{placeholder}</span>
//           )}

//           {/* Dropdown indicator */}
//           <div className="ml-auto flex items-center">
//             <ChevronDown
//               size={18}
//               className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
//             />
//           </div>
//         </div>

//         {/* Dropdown */}
//         {isOpen && (
//           <div
//             className="
//             absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md
//             animate-in fade-in-0 zoom-in-95 duration-100
//           "
//           >
//             {/* Search input */}
//             <div className="flex items-center px-3 py-2 border-b border-border">
//               <Search size={16} className="text-muted-foreground mr-2" />
//               <input
//                 ref={searchInputRef}
//                 type="text"
//                 value={searchTerm}
//                 onChange={(e) => setSearchTerm(e.target.value)}
//                 placeholder="Search..."
//                 className="w-full bg-transparent border-none outline-none text-sm"
//                 onClick={(e) => e.stopPropagation()}
//               />
//             </div>

//             {/* Options list */}
//             <div className="max-h-[200px] overflow-y-auto p-1">
//               {filteredOptions.length > 0 ? (
//                 filteredOptions.map((option) => (
//                   <div
//                     key={option.value}
//                     className={`
//                       flex items-center px-2 py-1.5 text-sm rounded-sm cursor-pointer
//                       ${values.includes(option.value) ? "bg-secondary/50" : "hover:bg-muted"}
//                     `}
//                     onClick={(e) => {
//                       e.stopPropagation()
//                       handleSelect(option.value)
//                     }}
//                   >
//                     <div className="w-5 h-5 mr-2 flex items-center justify-center">
//                       {values.includes(option.value) && <Check size={16} className="text-primary" />}
//                     </div>
//                     {option.label}
//                   </div>
//                 ))
//               ) : (
//                 <div className="px-2 py-4 text-sm text-center text-muted-foreground">{emptyMessage}</div>
//               )}
//             </div>
//           </div>
//         )}
//       </div>

//       {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
//     </div>
//   )
// }

"use client";

import type React from "react";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

export type Option = {
  value: string;
  label: string;
  [key: string]: string | number | boolean | undefined;
};

export interface CustomMultiSelectProps {
  options: Option[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function CustomMultiSelect({
  options,
  value,
  defaultValue = [],
  onChange,
  placeholder = "Select options...",
  emptyMessage = "No options found.",
  label,
  description,
  disabled = false,
  className = "",
}: CustomMultiSelectProps) {
  // State for dropdown open/close
  const [isOpen, setIsOpen] = useState(false);

  // State for search input
  const [searchTerm, setSearchTerm] = useState("");

  // State for selected values (for uncontrolled component)
  const [selectedValues, setSelectedValues] = useState<string[]>(defaultValue);

    // Normalize values to always use IDs for comparison
    const normalizedValues = (values: (string | { id: string; label: string })[]) =>
        values.map((val) => (typeof val === "string" ? val : val.id));

  // Handle controlled component
  const values = value !== undefined ? value : selectedValues;

  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle selection of an option
  const handleSelect = (optionValue: string) => {
    const newValues = normalizedValues(values).includes(optionValue)
      ? values.filter((val) => normalizedValues([val])[0] !== optionValue)
      : [...values, optionValue];

    // Update internal state for uncontrolled component
    if (value === undefined) {
      setSelectedValues(newValues);
    }

    // Call onChange handler if provided
    onChange?.(newValues);
  };

  // Handle removal of a selected option
  const handleRemove = (optionValue: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const newValues = values.filter((val) => normalizedValues([val])[0] !== optionValue);

    // Update internal state for uncontrolled component
    if (value === undefined) {
      setSelectedValues(newValues);
    }

    // Call onChange handler if provided
    onChange?.(newValues);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Escape":
        setIsOpen(false);
        break;
      case "ArrowDown":
        if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case "Backspace":
        if (!searchTerm && values.length > 0) {
            handleRemove(normalizedValues(values)[values.length - 1]);
          }
        break;
    }
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}

      <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
        {/* Main input area */}
        <div
          className={`
            flex flex-wrap items-center gap-1 p-2 border rounded-md min-h-[42px] 
            ${isOpen ? "border-primary ring-1 ring-primary" : "border-input"} 
            ${disabled ? "bg-muted opacity-50 cursor-not-allowed" : "bg-background cursor-pointer"}
            transition-all duration-200
          `}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {/* Selected items */}
          {values.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {values.map((val, index) => {
                                const optionId = normalizedValues([val])[0];
                                const option = options.find((opt) => opt.value === optionId);
                return (
                  <span
                    key={index}
                    className="
                      flex items-center gap-1 px-2 py-1 text-xs rounded-md
                      bg-secondary text-secondary-foreground
                    "
                  >
                    {option?.label}
                    {/* <button
                      type="button"
                      onClick={(e) => handleRemove(val, e)}
                      disabled={disabled}
                      className="text-secondary-foreground/70 hover:text-secondary-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded-full"
                      aria-label={`Remove ${option?.label}`}
                    >
                      <X size={14} />
                    </button> */}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}

          {/* Dropdown indicator */}
          <div className="ml-auto flex items-center">
            <ChevronDown
              size={18}
              className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div
            className="
            absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md
            animate-in fade-in-0 zoom-in-95 duration-100
          "
          >
            {/* Search input */}
            <div className="flex items-center px-3 py-2 border-b border-border">
              <Search size={16} className="text-muted-foreground mr-2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full bg-transparent border-none outline-none text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options list */}
            <div className="max-h-[200px] overflow-y-auto p-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`
                      flex items-center px-2 py-1.5 text-sm rounded-sm cursor-pointer
                      ${values.includes(option.value) ? "bg-secondary/50" : "hover:bg-muted"}
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(option.value);
                    }}
                  >
                    <div className="w-5 h-5 mr-2 flex items-center justify-center">
                    {normalizedValues(values).includes(option.value) && <Check size={16} className="text-primary" />}
                    </div>
                    {option.label}
                  </div>
                ))
              ) : (
                <div className="px-2 py-4 text-sm text-center text-muted-foreground">{emptyMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}