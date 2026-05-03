import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = [
  path.join(root, 'src/app/settings/page.tsx'),
  path.join(root, 'src/components/Navbar.tsx'),
  path.join(root, 'src/app/onboarding/page.tsx'),
  path.join(root, 'src/components/for-you/SwipeMode.tsx'),
]

for (const file of files) {
  if (!fs.existsSync(file)) continue
  let text = fs.readFileSync(file, 'utf8')
  const before = text

  // appCopy is a function: appCopy(locale), not appCopy[locale].
  text = text.replace(/const\s+copy\s*=\s*appCopy\[locale\]/g, 'const copy = appCopy(locale)')
  text = text.replace(/const\s+navCopy\s*=\s*appCopy\[locale\]\.nav/g, 'const navCopy = appCopy(locale).nav')
  text = text.replace(/const\s+settingsCopy\s*=\s*appCopy\[locale\]\.settings/g, 'const settingsCopy = appCopy(locale).settings')
  text = text.replace(/const\s+onboardingCopy\s*=\s*appCopy\[locale\]\.onboarding/g, 'const onboardingCopy = appCopy(locale).onboarding')
  text = text.replace(/const\s+swipeUi\s*=\s*appCopy\[locale\]\.swipe/g, 'const swipeUi = appCopy(locale).swipe')
  text = text.replace(/const\s+commonUi\s*=\s*appCopy\[locale\]\.common/g, 'const commonUi = appCopy(locale).common')

  // Defensive cleanup for any remaining direct appCopy[locale] occurrences.
  text = text.replace(/appCopy\[locale\]/g, 'appCopy(locale)')

  if (text !== before) {
    fs.writeFileSync(file, text)
    console.log(`fixed ${path.relative(root, file)}`)
  }
}

console.log('i18n build fix v28 applied')
