"use client";

import React from "react";
import { ExpenseWorkspace } from "./expense/ExpenseWorkspace";

export interface ExpenseCaptureProps {
  onSaveExpense: (expense: {
    itemId?: string;
    title: string;
    amount: string;
    currency: string;
    category?: string;
    paymentMethod?: string;
    merchant?: string;
    occurredAt?: string;
  }) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  initialText?: string;
  onInitialTextConsumed?: () => void;
  onRequestVoice?: () => void;
}

export const ExpenseCapture: React.FC<ExpenseCaptureProps> = (props) => {
  return <ExpenseWorkspace {...props} />;
};
