"use client";

import { FormEvent, useEffect, useState } from "react";
import { matchesDeleteCode } from "@/lib/deleteCode";

/**
 * 🔐 Asks for «رمز الحذف» (lib/deleteCode.ts) in place of a plain confirm: shows what is about to
 * happen and resolves true only once the right code is typed (false on «إلغاء»). Used before
 * deleting devices and clients and before the profit-from-0 actions.
 */
type Request = { message: string; resolve: (ok: boolean) => void };

let show: ((request: Request) => void) | null = null;

export function askDeleteCode(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ message, resolve });
    else resolve(false);
  });
}

/** Mounted once in the root layout. */
export function DeleteCodeHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    show = (next) => {
      setRequest((current) => {
        current?.resolve(false);
        return next;
      });
      setCode("");
      setWrong(false);
    };
    return () => {
      show = null;
    };
  }, []);

  if (!request) return null;

  function close(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
    setCode("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (matchesDeleteCode(code)) close(true);
    else {
      setWrong(true);
      setCode("");
    }
  }

  return (
    <div className="dialog-backdrop delete-code-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && close(false)}>
      <form className="account-dialog delete-code-dialog" role="dialog" aria-modal="true" aria-label="رمز الحذف" onSubmit={submit}>
        <h2 className="delete-code-title">🔐 رمز الحذف</h2>
        <p className="delete-code-message">{request.message}</p>
        <input
          className="search-input app-lock-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          dir="ltr"
          placeholder="••••••"
          aria-label="رمز الحذف"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setWrong(false);
          }}
        />
        {wrong && <div className="account-card-alert ledger-form-error">الرمز غير صحيح</div>}
        <div className="delete-code-actions">
          <button className="dialog-danger" type="submit" disabled={!code}>
            تأكيد
          </button>
          <button className="dialog-secondary" type="button" onClick={() => close(false)}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
