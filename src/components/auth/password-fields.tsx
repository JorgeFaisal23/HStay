import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { PASSWORD_MIN } from "@/lib/password-policy";

/** Nueva contraseña + confirmación, con los mismos nombres que espera el servidor. */
export function NewPasswordFields() {
  return (
    <>
      <Field
        label="Nueva contraseña"
        htmlFor="password"
        required
        hint={`Al menos ${PASSWORD_MIN} caracteres. Una frase corta es fácil de recordar y difícil de adivinar.`}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
      </Field>
      <Field label="Repite la contraseña" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
      </Field>
    </>
  );
}
