# Minimal makefile for Sphinx documentation
#

# You can set these variables from the command line, and also
# from the environment for the first two.
SPHINXOPTS    ?= -nWT --keep-going
SPHINXBUILD   ?= sphinx-build
SOURCEDIR     = ./doc
BUILDDIR      = ./doc/_build

.PHONY: all no-plot clean-pyc clean-cache clean-e clean-doc flake doc doc-noplot link

all: flake clean doc main view

no-plot: flake clean doc-noplot main view

clean-pyc:
	find . -name "*.pyc" | xargs rm -f

clean-cache:
	find . -name "__pycache__" | xargs rm -rf

clean-e:
	find . -name "*-e" | xargs rm -rf

clean-doc:
	-rm -rf doc/_build doc/auto_examples

clean: clean-pyc clean-cache clean-e clean-doc

flake:
	@echo "Running flake8"
	@flake8 --count .

# Catch-all target: route all unknown targets to Sphinx using the new
# "make mode" option.  $(O) is meant as a shortcut for $(SPHINXOPTS).
doc:
	@$(SPHINXBUILD) -b html "$(SOURCEDIR)" "$(BUILDDIR)"

doc-noplot:
	@$(SPHINXBUILD) -D plot_gallery=True -b html "$(SOURCEDIR)" "$(BUILDDIR)"

main:
	python main.py

linkcheck:
	@$(SPHINXBUILD) -b linkcheck -D nitpicky=0 -D plot_gallery=0 \
		-d doc/_build/doctrees ./doc doc/_build/linkcheck

# View the built documentation
view:
	@python -c "import webbrowser; webbrowser.open_new_tab('file://$(PWD)/doc/_build/index.html')"