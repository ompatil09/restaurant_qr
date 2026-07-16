import React, { useState } from "react";
import { Alert, Button, Input, Modal } from "../ui";
import { hashPassword } from "../../utils/helpers";

interface PinModalProps {
  isOpen: boolean;
  title: string;
  expectedHash?: string;
  onClose: () => void;
  onVerified: () => void;
}

const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  title,
  expectedHash,
  onClose,
  onVerified,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!expectedHash) {
      onVerified();
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter the 4 to 6 digit admin PIN");
      return;
    }

    setChecking(true);
    const pinHash = await hashPassword(pin);
    setChecking(false);

    if (pinHash !== expectedHash) {
      setError("Incorrect PIN");
      setPin("");
      return;
    }

    setPin("");
    onVerified();
  };

  const handleClose = () => {
    setPin("");
    setError("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <Input
          label="Admin PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="4 to 6 digits"
          minLength={4}
          maxLength={6}
          pattern="[0-9]{4,6}"
          autoFocus
        />
        <div className="flex gap-3">
          <Button type="button" variant="outline" fullWidth onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={checking}>
            Confirm
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default PinModal;
