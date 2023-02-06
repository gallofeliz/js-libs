clean:
	rm -Rf dist
	rm -Rf /tmp/lib

.PHONY: test
test :
	./run-tests src/$(lib)

.PHONY: build
build: clean test
	test -n $(lib)
	test -e src/$(lib)/README.md
	tsc
	cp -R src/$(lib) /tmp/lib
	cp -R dist/src/$(lib)/* /tmp/lib
	rm /tmp/lib/*test*

.PHONY: release
deploy:
	npm whoami
	make build
	npm version minor
	git add -p
	git tag -a ...
	cp src/$(lib)/package.json /tmp/lib/
	cp src/$(lib)/package-lock.json /tmp/lib/
	npm publish --access public --token
	npm logout
	git push