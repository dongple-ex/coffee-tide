"use client";

import React, { useState } from "react";
import styles from "./calculatorWidget.module.css";

export function CalculatorWidget() {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [newNumber, setNewNumber] = useState(true);

  const handleNum = (num: string) => {
    if (newNumber) {
      setDisplay(num);
      setNewNumber(false);
    } else {
      setDisplay((prev) => (prev === "0" ? num : prev + num));
    }
  };

  const handleOp = (op: string) => {
    setExpression(`${display} ${op}`);
    setNewNumber(true);
  };

  const handleClear = () => {
    setDisplay("0");
    setExpression("");
    setNewNumber(true);
  };

  const handleBackspace = () => {
    if (newNumber) return;
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  };

  const handlePercent = () => {
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setDisplay(String(val / 100));
    }
  };

  const handleEqual = () => {
    if (!expression) return;
    try {
      const parts = expression.trim().split(" ");
      const prev = parseFloat(parts[0]);
      const op = parts[1];
      const curr = parseFloat(display);

      let result = 0;
      if (op === "+") result = prev + curr;
      else if (op === "-") result = prev - curr;
      else if (op === "×") result = prev * curr;
      else if (op === "÷") result = curr !== 0 ? prev / curr : 0;

      const formatted = Number.isInteger(result) ? String(result) : String(parseFloat(result.toFixed(6)));
      setDisplay(formatted);
      setExpression(`${expression} ${display} =`);
      setNewNumber(true);
    } catch {
      setDisplay("Error");
      setNewNumber(true);
    }
  };

  const handleDot = () => {
    if (newNumber) {
      setDisplay("0.");
      setNewNumber(false);
    } else if (!display.includes(".")) {
      setDisplay((prev) => prev + ".");
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const key = e.key;

      if (key >= "0" && key <= "9") {
        e.preventDefault();
        handleNum(key);
      } else if (key === ".") {
        e.preventDefault();
        handleDot();
      } else if (key === "+") {
        e.preventDefault();
        handleOp("+");
      } else if (key === "-") {
        e.preventDefault();
        handleOp("-");
      } else if (key === "*") {
        e.preventDefault();
        handleOp("×");
      } else if (key === "/") {
        e.preventDefault();
        handleOp("÷");
      } else if (key === "Enter" || key === "=") {
        e.preventDefault();
        handleEqual();
      } else if (key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (key === "Escape" || key.toLowerCase() === "c") {
        e.preventDefault();
        handleClear();
      } else if (key === "%") {
        e.preventDefault();
        handlePercent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [display, expression, newNumber]);

  const formatNumberWithCommas = (valStr: string): string => {
    if (!valStr || valStr === "Error") return valStr;
    const parts = valStr.split(".");
    const intPart = parts[0];
    const decimalPart = parts.length > 1 ? "." + parts[1] : "";

    const isNegative = intPart.startsWith("-");
    const cleanInt = isNegative ? intPart.slice(1) : intPart;
    const formattedInt = cleanInt.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return (isNegative ? "-" : "") + formattedInt + decimalPart;
  };

  const formatExpression = (expStr: string): string => {
    if (!expStr) return "";
    return expStr
      .split(" ")
      .map((token) => (!isNaN(Number(token)) ? formatNumberWithCommas(token) : token))
      .join(" ");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span>🧮</span>
        <span>빠른 계산기</span>
      </div>

      <div className={styles.display}>
        <div className={styles.expression}>{formatExpression(expression)}</div>
        <div className={styles.value}>{formatNumberWithCommas(display)}</div>
      </div>

      <div className={styles.keypad}>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={handleClear}>
          C
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={handleBackspace}>
          ⌫
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={handlePercent}>
          %
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={() => handleOp("÷")}>
          ÷
        </button>

        <button type="button" className={styles.btn} onClick={() => handleNum("7")}>
          7
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("8")}>
          8
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("9")}>
          9
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={() => handleOp("×")}>
          ×
        </button>

        <button type="button" className={styles.btn} onClick={() => handleNum("4")}>
          4
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("5")}>
          5
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("6")}>
          6
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={() => handleOp("-")}>
          -
        </button>

        <button type="button" className={styles.btn} onClick={() => handleNum("1")}>
          1
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("2")}>
          2
        </button>
        <button type="button" className={styles.btn} onClick={() => handleNum("3")}>
          3
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnOperator}`} onClick={() => handleOp("+")}>
          +
        </button>

        <button type="button" className={styles.btn} onClick={() => handleNum("0")}>
          0
        </button>
        <button type="button" className={styles.btn} onClick={handleDot}>
          .
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnEqual}`} onClick={handleEqual}>
          =
        </button>
      </div>
    </div>
  );
}
