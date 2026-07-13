import React, { useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Input } from "../../components/ui";
import { requestPasswordReset } from "../../services/authService";
import { validateEmail } from "../../utils/security";

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="inline-flex items-center text-text-secondary hover:text-text mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Link>

        <Card>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/5 mb-4">
              <ShieldCheck className="w-9 h-9 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">
              Reset Restaurant Password
            </h1>
            <p className="text-text-secondary">
              Your reset request goes to the admin team for approval.
            </p>
          </div>

          {submitted ? (
            <div className="space-y-5">
              <Alert
                type="success"
                title="Request submitted"
                message="If this email is registered, a reset request will be sent to admin."
              />
              <Link to="/login">
                <Button fullWidth>Back to Login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <Alert type="error" message={error} />}
              <Input
                label="Registered Email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="manager@example.com"
                icon={<Mail className="w-5 h-5" />}
                autoComplete="email"
                required
              />
              <Button type="submit" loading={loading} fullWidth>
                Send Reset Request
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
