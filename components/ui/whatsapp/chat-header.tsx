"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ChatHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  avatar?: string;
  status?: string;
  isOnline?: boolean;
}

function AvatarFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 212 212" className={className}>
      <path
        d="M106.251.5C164.653.5 212 47.846 212 106.25S164.653 212 106.25 212C47.846 212 .5 164.654.5 106.25S47.846.5 106.251.5z"
        className="fill-wa-gray-300"
      />
      <path
        d="M106.002 125.5c-21.162 0-37.345-16.183-37.345-37.345 0-21.162 16.183-37.345 37.345-37.345 21.159 0 37.342 16.183 37.342 37.345 0 21.162-16.183 37.345-37.342 37.345zM173.561 171.615a62.767 62.767 0 0 0-2.065-2.955 67.7 67.7 0 0 0-2.608-3.299 70.112 70.112 0 0 0-3.184-3.527 71.097 71.097 0 0 0-5.924-5.47 72.458 72.458 0 0 0-10.204-7.026 75.2 75.2 0 0 0-5.98-3.055c-.062-.028-.118-.059-.18-.087-9.792-4.44-22.106-7.529-37.416-7.529s-27.624 3.089-37.416 7.529c-.338.153-.653.318-.985.474a75.37 75.37 0 0 0-6.229 3.298 72.589 72.589 0 0 0-9.15 6.395 71.243 71.243 0 0 0-5.924 5.47 70.064 70.064 0 0 0-3.184 3.527 67.142 67.142 0 0 0-2.609 3.299 63.292 63.292 0 0 0-2.065 2.955c18.285 17.927 43.322 28.985 70.945 28.985 27.623 0 52.661-11.058 70.945-28.985z"
        fill="currentColor"
      />
    </svg>
  );
}

const ChatHeader = React.forwardRef<HTMLDivElement, ChatHeaderProps>(
  ({ className, name, avatar, status, isOnline = false, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("font-wa flex h-wa-header-height items-center gap-[10px] bg-wa-panel-header-bg px-4 py-2", className)} {...props}>
        <div className="relative shrink-0">
          <div className="h-wa-avatar-sm w-wa-avatar-sm overflow-hidden rounded-full bg-wa-gray-300">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="h-full w-full text-wa-gray-100" />
            )}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full" style={{ background: "var(--wa-emerald-500)", border: "2px solid var(--wa-panel-header-bg)" }} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="truncate text-[16px] leading-[21px] text-wa-text-primary">{name}</span>
          {(status || isOnline) && (
            <span className="truncate text-[13px] leading-[20px] text-wa-text-secondary">{isOnline ? "online" : status}</span>
          )}
        </div>
      </div>
    );
  }
);
ChatHeader.displayName = "ChatHeader";

export { ChatHeader, type ChatHeaderProps };
