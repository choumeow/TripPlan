// The TripPlan brand mark (public/logo.svg). Size it via the passed className
// (height; width auto-scales to the artwork's aspect ratio). Defaults to
// decorative (alt="") since it's paired with the "TripPlan" wordmark; pass an
// alt when used standalone.
export function Logo({ className, alt = '' }) {
  return <img src="/logo.svg" className={className} alt={alt} />
}
