import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * The signed-in user's picture, falling back to their initials.
 *
 * One component for every place an avatar appears, because the fallback and
 * the expiry handling are the fiddly parts and having three copies of them
 * meant only the screen you uploaded from ever showed the photo.
 *
 * The URL is presigned and lives about an hour. A session open longer than
 * that gets a 403 on the image, so `onError` shows initials and asks the
 * context for a fresh URL — once, since a genuinely broken picture must not
 * turn into a refetch loop.
 */
const UserAvatar = ({
  size = 40,
  className = "",
}: {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
}) => {
  const { user, avatarUrl, refreshAvatar } = useAuth();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // A new URL deserves a fresh attempt, even if the previous one failed.
  useEffect(() => {
    if (avatarUrl && avatarUrl !== failedUrl) setFailedUrl(null);
  }, [avatarUrl, failedUrl]);

  const initials =
    `${(user?.first_name?.[0] ?? "").toUpperCase()}${(user?.last_name?.[0] ?? "").toUpperCase()}` ||
    "U";

  const showPicture = Boolean(avatarUrl) && avatarUrl !== failedUrl;

  if (showPicture) {
    return (
      <img
        src={avatarUrl as string}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => {
          setFailedUrl(avatarUrl);
          void refreshAvatar();
        }}
        className={`rounded-full object-cover bg-secondary shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      className={`flex items-center justify-center rounded-full bg-accent/10 font-bold text-accent shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};

export default UserAvatar;
