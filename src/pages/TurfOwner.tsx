import { Navigate } from "react-router-dom";

// DEPRECATED: TurfOwner dashboard replaced by VenueOwnerDashboard.
// This route now redirects to /venue/dashboard.
export default function TurfOwner() {
  return <Navigate to="/venue/dashboard" replace />;
}
