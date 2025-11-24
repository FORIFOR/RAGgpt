import { LibraryApp } from "@/components/library/LibraryApp";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function LibraryPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-sumi-50">
        <LibraryApp />
      </div>
    </ProtectedRoute>
  );
}
