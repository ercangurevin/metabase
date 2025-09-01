git reset HEAD~1
rm ./backport.sh
git cherry-pick 022b84e40d5b7a19bd6bf69dea43ce254153e3dc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
