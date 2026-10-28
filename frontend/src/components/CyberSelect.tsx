import React, { useState, useRef, useEffect } from 'react';

export interface CyberSelectOption {
    value: string;
    label: string;
    badge?: string;
}

interface CyberSelectProps {
    value: string;
    options: CyberSelectOption[];
    onChange: (val: string) => void;
    prefix?: string;
    className?: string;
}

export const CyberSelect: React.FC<CyberSelectProps> = ({
    value,
    options,
    onChange,
    prefix = 'LOC',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((o) => o.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div className={`cyber-select-container ${className} ${isOpen ? 'open' : ''}`} ref={containerRef}>
            <button
                type="button"
                className="cyber-select-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <div className="cyber-select-val-group">
                    <span className="cyber-select-prefix">[{prefix}]</span>
                    <span className="cyber-select-current-text">{selectedOption ? selectedOption.label : value}</span>
                </div>
                <div className="cyber-select-arrow-wrap">
                    <span className={`cyber-select-arrow ${isOpen ? 'rotated' : ''}`}>▾</span>
                </div>
            </button>

            {isOpen && (
                <div className="cyber-select-dropdown" role="listbox">
                    <div className="cyber-select-dropdown-header">
                        <span className="cyber-select-header-title">// SELECT_PARAMETER</span>
                        <span className="cyber-select-header-decor">SYS_PARAM</span>
                    </div>
                    <div className="cyber-select-options-list">
                        {options.map((opt, idx) => {
                            const isSelected = opt.value === value;
                            const idxStr = (idx + 1).toString().padStart(2, '0');
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`cyber-select-option ${isSelected ? 'active' : ''}`}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                >
                                    <div className="cyber-option-left">
                                        <span className="cyber-option-index">[{idxStr}]</span>
                                        <span className="cyber-option-label">{opt.label}</span>
                                    </div>
                                    {isSelected ? (
                                        <span className="cyber-option-check">✓ ACTIVE</span>
                                    ) : (
                                        opt.badge && <span className="cyber-option-badge">{opt.badge}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
