import React from 'react'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
}

export function Logo({ className = '', size = 'md', showText = true }: LogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }

  const textSizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-6xl',
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        className={`${sizeClasses[size]} flex-shrink-0`}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Background gradient */}
          <linearGradient id="mapBgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="50%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          
          {/* Border gradient */}
          <linearGradient id="mapBorderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          
          {/* Grid cell colors */}
          <linearGradient id="cellGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e40af" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          
          <linearGradient id="cellGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          
          <linearGradient id="cellGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#db2777" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          
          {/* Treasure gradient */}
          <radialGradient id="treasureGradient">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
          
          {/* Start point gradient */}
          <radialGradient id="startGradient">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </radialGradient>
        </defs>
        
        {/* Map background with rounded corners */}
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="8"
          fill="url(#mapBgGradient)"
          stroke="url(#mapBorderGradient)"
          strokeWidth="3"
        />
        
        {/* Grid cells - creating a map-like appearance */}
        {/* Row 1 */}
        <rect x="15" y="15" width="18" height="18" rx="2" fill="url(#cellGradient1)" opacity="0.8" />
        <rect x="35" y="15" width="18" height="18" rx="2" fill="url(#cellGradient2)" opacity="0.6" />
        <rect x="55" y="15" width="18" height="18" rx="2" fill="url(#cellGradient3)" opacity="0.7" />
        <rect x="75" y="15" width="10" height="18" rx="2" fill="url(#cellGradient1)" opacity="0.5" />
        
        {/* Row 2 */}
        <rect x="15" y="35" width="18" height="18" rx="2" fill="url(#cellGradient2)" opacity="0.6" />
        <rect x="35" y="35" width="18" height="18" rx="2" fill="url(#cellGradient3)" opacity="0.8" />
        <rect x="55" y="35" width="18" height="18" rx="2" fill="url(#cellGradient1)" opacity="0.7" />
        <rect x="75" y="35" width="10" height="18" rx="2" fill="url(#cellGradient2)" opacity="0.5" />
        
        {/* Row 3 */}
        <rect x="15" y="55" width="18" height="18" rx="2" fill="url(#cellGradient3)" opacity="0.7" />
        <rect x="35" y="55" width="18" height="18" rx="2" fill="url(#cellGradient1)" opacity="0.8" />
        <rect x="55" y="55" width="18" height="18" rx="2" fill="url(#cellGradient2)" opacity="0.6" />
        <rect x="75" y="55" width="10" height="18" rx="2" fill="url(#cellGradient3)" opacity="0.5" />
        
        {/* Row 4 */}
        <rect x="15" y="75" width="18" height="10" rx="2" fill="url(#cellGradient1)" opacity="0.5" />
        <rect x="35" y="75" width="18" height="10" rx="2" fill="url(#cellGradient2)" opacity="0.6" />
        <rect x="55" y="75" width="18" height="10" rx="2" fill="url(#cellGradient3)" opacity="0.7" />
        <rect x="75" y="75" width="10" height="10" rx="2" fill="url(#cellGradient1)" opacity="0.4" />
        
        {/* Grid lines */}
        <g stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1">
          <line x1="33" y1="15" x2="33" y2="85" />
          <line x1="53" y1="15" x2="53" y2="85" />
          <line x1="73" y1="15" x2="73" y2="85" />
          <line x1="15" y1="33" x2="85" y2="33" />
          <line x1="15" y1="53" x2="85" y2="53" />
          <line x1="15" y1="73" x2="85" y2="73" />
        </g>
        
        {/* Start point (green) */}
        <circle cx="24" cy="24" r="6" fill="url(#startGradient)" stroke="white" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="3" fill="white" opacity="0.8" />
        
        {/* Path line from start to treasure */}
        <path
          d="M 24 24 L 35 35 L 55 35 L 67 47"
          stroke="url(#mapBorderGradient)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        
        {/* Treasure point (gold) */}
        <circle cx="67" cy="47" r="7" fill="url(#treasureGradient)" stroke="#92400e" strokeWidth="2" />
        <path
          d="M 67 42 L 69 47 L 67 52 L 65 47 Z"
          fill="#fbbf24"
          stroke="#92400e"
          strokeWidth="1"
        />
        
        {/* Decorative elements - small dots along path */}
        <circle cx="35" cy="35" r="2" fill="#a855f7" opacity="0.8" />
        <circle cx="55" cy="35" r="2" fill="#ec4899" opacity="0.8" />
      </svg>
      
      {showText && (
        <span
          className={`${textSizeClasses[size]} font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400`}
        >
          TREASURE TRAIL
        </span>
      )}
    </div>
  )
}
