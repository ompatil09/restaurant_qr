import React, { useEffect, useState } from "react";
import { CheckCircle, KeyRound, XCircle } from "lucide-react";
import { Alert, Button, Card, Loading } from "../../components/ui";
import type { PasswordResetRequest } from "../../config/supabase";
import {
  approvePasswordReset,
  rejectPasswordReset,
  subscribeToPasswordResetRequests,
} from "../../services/authService";

const PasswordResetRequests: React.FC = () => {
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
    restaurantName: string;
  } | null>(null);

  useEffect(() => {
    const subscription = subscribeToPasswordResetRequests((data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getAdminId = () => {
    const admin = JSON.parse(localStorage.getItem("admin") || "{}");
    return admin?.id || "";
  };

  const handleApprove = async (requestId: string) => {
    setError("");
    const result = await approvePasswordReset(requestId, getAdminId());
    if (!result.success || !result.credentials) {
      setError(result.error || "Unable to approve reset request.");
      return;
    }
    setCredentials(result.credentials);
  };

  const handleReject = async (requestId: string) => {
    setError("");
    const result = await rejectPasswordReset(
      requestId,
      getAdminId(),
      "Rejected by admin"
    );
    if (!result.success) {
      setError(result.error || "Unable to reject reset request.");
    }
  };

  if (loading) return <Loading text="Loading reset requests..." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text mb-2">
          Password Reset Requests
        </h2>
        <p className="text-text-secondary">
          Approve requests and share the generated temporary password manually.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}
      {credentials && (
        <Alert
          type="success"
          title="Temporary password generated"
          message={`Restaurant: ${credentials.restaurantName} | Email: ${credentials.email} | Temporary password: ${credentials.password}`}
        />
      )}

      {requests.length === 0 ? (
        <Card className="text-center py-12">
          <KeyRound className="w-14 h-14 text-text-secondary mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-text mb-2">
            No Pending Requests
          </h3>
          <p className="text-text-secondary">
            New reset requests will appear here.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-bold text-text">
                    {request.restaurant_name || "Unknown Restaurant"}
                  </p>
                  <p className="text-text-secondary">{request.email}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    Requested {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    icon={<CheckCircle className="w-4 h-4" />}
                    onClick={() => handleApprove(request.id)}
                  >
                    Approve Reset
                  </Button>
                  <Button
                    variant="outline"
                    icon={<XCircle className="w-4 h-4" />}
                    onClick={() => handleReject(request.id)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordResetRequests;
