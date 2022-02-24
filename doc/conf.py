"""Configure details for documentation with sphinx."""
import os.path as op
import sys
from datetime import date
sys.path.insert(0, op.abspath('.'))
sys.path.insert(0, op.abspath(op.join('.', 'sphinxext')))

# -- Project information -----------------------------------------------------

project = 'dipole-simulator2'
td = date.today()
copyright = u'2022-%s, Alex Rockhill. Last updated on %s' % (td.year,
                                                             td.isoformat())
author = 'Alex Rockhill'

# The full version, including alpha/beta/rc tags
release = 'v0.1dev'

# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.githubpages',
    'sphinx.ext.mathjax',
    'sphinx.ext.viewcode',
    'sphinx.ext.doctest',
    'sphinx.ext.intersphinx',
    'sphinx_gallery.gen_gallery',
    'sphinx_copybutton',
    'gh_substitutions'  # custom extension, see ./sphinxext/gh_substitutions.py
]

# configure sphinx-copybutton
copybutton_prompt_text = r">>> |\.\.\. |\$ "
copybutton_prompt_is_regexp = True

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------

# HTML options (e.g., theme)
html_show_sourcelink = False
html_copy_source = False

html_theme = 'pydata_sphinx_theme'

# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']
html_static_path = ['_static']

# Theme options are theme-specific and customize the look and feel of a theme
# further.  For a list of options available for each theme, see the
# documentation.
html_theme_options = {
    'icon_links': [
        dict(name='GitHub',
             url='https://github.com/alexrockhill/dipole-simulator2',
             icon='fab fa-github-square')
    ],
}

html_sidebars = {
    "**": []
}

# Example configuration for intersphinx: refer to the Python standard library.
intersphinx_mapping = {
    'python': ('https://docs.python.org/3', None),
    'mne': ('https://mne.tools/dev', None),
    'numpy': ('https://numpy.org/devdocs', None),
    'scipy': ('https://scipy.github.io/devdocs', None),
    'matplotlib': ('https://matplotlib.org', None),
    'nilearn': ('https://nilearn.github.io', None),
    'nibabel': ('https://nipy.org/nibabel', None),
}
intersphinx_timeout = 5

sphinx_gallery_conf = {
    'examples_dirs': '../examples',
    'gallery_dirs': 'auto_examples',
    'plot_gallery': 'True',  # Avoid annoying Unicode/bool default warning
    'image_scrapers': ('matplotlib', 'pyvista')
}

linkcheck_timeout = 15  # some can be quite slow
