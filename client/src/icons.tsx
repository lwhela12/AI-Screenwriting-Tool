import React from 'react';

/** Stroke icons on a 24-unit grid, drawn inline so they take the current text colour. */
const Icon: React.FC<{ d: React.ReactNode; size?: number; stroke?: number; title?: string }> = ({ d, size = 16, stroke = 1.5, title }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title ? <title>{title}</title> : null}
    {d}
  </svg>
);

export const SidebarIcon = () => <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /></>} />;
export const InspectorIcon = () => <Icon d={<><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="15" y1="4" x2="15" y2="20" /></>} />;
export const SearchIcon = () => <Icon d={<><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></>} />;
export const FocusIcon = () => <Icon d={<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />} />;
export const PaletteIcon = () => <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18c-2 0-2.5-1.5-1.5-2.5S12 16 12 14a2 2 0 0 1 2-2c2 0 3-.5 3-2 0-4-2.5-7-5-7z" /></>} />;
export const DocIcon = () => <Icon d={<><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><polyline points="14 3 14 8 19 8" /></>} />;
export const GridIcon = () => <Icon d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>} />;
export const BoardIcon = () => <Icon d={<><rect x="3" y="5" width="8" height="6" rx="1" /><rect x="13" y="9" width="8" height="6" rx="1" /><rect x="6" y="15" width="8" height="5" rx="1" /></>} />;
export const ReportIcon = () => <Icon d={<><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="10" width="3" height="8" /><rect x="11" y="6" width="3" height="12" /><rect x="16" y="13" width="3" height="5" /></>} />;
export const PlusIcon = () => <Icon size={14} stroke={1.8} d={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />;
export const ChevronDownIcon = () => <Icon size={12} stroke={1.8} d={<polyline points="6 9 12 15 18 9" />} />;
export const CloseIcon = () => <Icon size={14} stroke={1.8} d={<><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>} />;
export const ExportIcon = () => <Icon d={<><path d="M12 3v12" /><polyline points="7 8 12 3 17 8" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>} />;
export const FolderIcon = () => <Icon d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} />;
export const ArrowUpIcon = () => <Icon size={14} stroke={1.8} d={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />;
export const ArrowDownIcon = () => <Icon size={14} stroke={1.8} d={<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>} />;
