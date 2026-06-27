import AdminEmailMarketing from "@/components/admin/AdminEmailMarketing";

export default function AdminEmailPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Email Marketing</h1>
        <p className="text-gray-600 mt-2">Send emails to users for voting campaigns and announcements</p>
      </div>
      
      <AdminEmailMarketing />
    </div>
  );
}
