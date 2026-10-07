import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/context/language-context"
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n"

const FLAGS: Record<Language, string> = { en: "🇺🇸", "pt-BR": "🇧🇷", es: "🇪🇸" }

export function LanguageSelector() {
  const { t, language, setLanguage } = useLanguage()

  return (
    <Select
      value={language}
      onValueChange={(value) => setLanguage(value as Language)}
    >
      <SelectTrigger
        size="lg"
        // Fixed width sized to the longest option ("Português (Brasil)") so
        // switching languages doesn't resize the trigger (w-fit would jump
        // between options), without stretching to the full row like w-full.
        className="w-56"
        aria-label={t("account.language")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent size="lg" position="popper" align="start">
        {SUPPORTED_LANGUAGES.map((lang: Language) => (
          <SelectItem key={lang} value={lang}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{FLAGS[lang]}</span>
              {t(`account.language_${lang}`)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
