// The TripPlan brand mark (public/logo.svg). Size it via the passed className
// (height; width auto-scales to the artwork's aspect ratio).
export function Logo({ className }) {
  return <img src="/logo.svg" className={className} alt="TripPlan" />
}
