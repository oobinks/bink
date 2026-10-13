// Official social logos (from Simple Icons), drawn in the text colour so they suit the dark look.
import { siInstagram, siTiktok, siSoundcloud, siMixcloud, siYoutube } from 'simple-icons';

const make = (icon) => function BrandIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" role="img" aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
};

export const Instagram = make(siInstagram);
export const TikTok = make(siTiktok);
export const SoundCloud = make(siSoundcloud);
export const Mixcloud = make(siMixcloud);
export const YouTube = make(siYoutube);
