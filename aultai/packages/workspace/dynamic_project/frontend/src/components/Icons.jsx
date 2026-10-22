const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" };

export const BagIcon = () => (
  <svg width="18" height="18" {...base}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const SearchIcon = () => (
  <svg width="18" height="18" {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
);
export const CloseIcon = () => (
  <svg width="18" height="18" {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const CheckIcon = () => (
  <svg width="34" height="34" {...base} strokeWidth="2.5"><path d="m5 12 5 5 9-10" /></svg>
);
export const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#C99A2E"><path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" /></svg>
);

export function Rating({ rating, reviews }) {
  return (
    <>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><StarIcon />{rating}</span>
      <span>{reviews} reviews</span>
    </>
  );
}
