import { useEffect, useState } from "react";
import type { ParticipantProfile } from "../domain/chatTypes";
import { getInitialLetter } from "../domain/profiles";
import { loadAvatarThumbnail } from "../storage/chatSessionStore";

interface AvatarViewProps {
  profile: ParticipantProfile;
  size?: "sm" | "md" | "lg";
}

export function AvatarView({ profile, size = "md" }: AvatarViewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let nextUrl: string | null = null;

    if (profile.avatar.kind !== "uploadedThumbnail") {
      setObjectUrl(null);
      return undefined;
    }

    loadAvatarThumbnail(profile.avatar.thumbnailId).then((blob) => {
      if (!active || !blob) {
        return;
      }

      nextUrl = URL.createObjectURL(blob);
      setObjectUrl(nextUrl);
    });

    return () => {
      active = false;

      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [profile.avatar]);

  if (objectUrl) {
    return <img className={`avatar avatar-${size}`} src={objectUrl} alt="" />;
  }

  return (
    <span className={`avatar avatar-${size}`} style={{ backgroundColor: profile.color }}>
      {getInitialLetter(profile.displayName || profile.originalName)}
    </span>
  );
}
