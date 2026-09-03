import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/context/language-context"
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n"

export function LanguageSelector() {
  const { t, language, setLanguage } = useLanguage()

  return (
    <Select
      value={language}
      onValueChange={(value) => setLanguage(value as Language)}
    >
      <SelectTrigger className="w-full" aria-label={t("account.language")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang: Language) => (
          <SelectItem key={lang} value={lang}>
            {t(`account.language_${lang}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
