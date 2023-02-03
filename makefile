clean:
	rm -Rf dist
	rm -Rf /tmp/lib

.PHONY: test
test :
	npx run-tests src/$(lib)

.PHONY: build
build: clean test
	test -n $(lib)
	test -e src/$(lib)/README.md
	tsc
	cp -R src/$(lib) /tmp/lib
	cp -R dist/src/$(lib)/* /tmp/lib
	rm /tmp/lib/*test*

.PHONY: deploy
deploy: build
	cd /tmp/lib && false