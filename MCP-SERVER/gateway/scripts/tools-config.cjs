/**
 * Configuración de herramientas MCP: nombre, alias y palabras clave para sugerencias.
 * Al agregar una nueva tool al MCP, añade aquí una entrada con name, aliases y keywords.
 * - name: nombre exacto de la tool (debe coincidir con el del servidor MCP y con docs/tools/<name>.md).
 * - aliases: nombres alternativos para invocar la tool (ej. "buscar", "search") sin recordar el nombre técnico.
 * - keywords: frases o palabras que permiten a la IA/sugerencia detectar que el usuario se refiere a esta tool.
 */
module.exports = [
  {
    name: 'search_docs',
    aliases: ['buscar', 'search', 'buscar docs', 'buscar documentación', 'find', 'consulta'],
    keywords: ['buscar en la documentación', 'buscar en docs', 'encontrar documento', 'buscar información indexada', 'query búsqueda'],
  },
  {
    name: 'count_docs',
    aliases: ['contar', 'count', 'cuántos documentos', 'total documentos', 'estadísticas'],
    keywords: ['cuántos docs hay', 'cuántos documentos indexados', 'total de documentos', 'contar puntos'],
  },
  {
    name: 'analize_code',
    aliases: ['analizar', 'analizar código', 'analyze', 'análisis con contexto', 'código con contexto'],
    keywords: ['analizar código', 'análisis de código', 'contexto desde la bd', 'bug documentación', 'revisar con documentación'],
  },
  {
    name: 'index_url',
    aliases: ['indexar url', 'indexar página', 'index url', 'añadir url', 'agregar url'],
    keywords: ['indexar una url', 'indexar página web', 'añadir página al índice', 'indexar enlace'],
  },
  {
    name: 'index_url_with_links',
    aliases: ['indexar con enlaces', 'indexar url y enlaces', 'url con links', 'indexar varias páginas'],
    keywords: ['indexar url y enlaces', 'indexar página y enlaces', 'varias páginas del mismo sitio'],
  },
  {
    name: 'index_site',
    aliases: ['indexar sitio', 'indexar sitio completo', 'index site', 'indexar todo el sitio'],
    keywords: ['indexar sitio completo', 'indexar todo el sitio', 'recorrer sitio', 'indexar wiki', 'indexar documentación completa'],
  },
  {
    name: 'write_flow_doc',
    aliases: ['flow doc', 'flujo', 'escribir flujo', 'write flow', 'documento de flujo', 'mapa de flujos'],
    keywords: ['crear documento de flujo', 'escribir flujo', 'mapa de flujos', 'nodo del mapa', 'flow doc', 'guardar en inbox'],
  },
  {
    name: 'list_shared_dir',
    aliases: ['listar', 'listar directorio', 'list dir', 'listar carpeta', 'ver directorio compartido'],
    keywords: ['listar directorio', 'listar carpeta', 'ver archivos compartidos', 'contenido del directorio'],
  },
  {
    name: 'read_shared_file',
    aliases: ['leer archivo', 'read file', 'leer fichero', 'contenido archivo compartido'],
    keywords: ['leer archivo', 'leer fichero compartido', 'contenido del archivo', 'abrir archivo del compartido'],
  },
  {
    name: 'list_url_links',
    aliases: ['listar urls', 'listar enlaces', 'listar archivos remotos', 'enlaces url', 'sublinks', 'links url'],
    keywords: ['listar enlaces de una url', 'cuántos enlaces tiene', 'sublinks de la url', 'listar archivos remotos', 'enlaces dentro de la página'],
  },
  {
    name: 'view_url',
    aliases: ['ver url', 'ver contenido url', 'inspeccionar url', 'ver página', 'contenido url', 'fetch url'],
    keywords: ['ver contenido de la url', 'ver url en consola', 'inspeccionar url', 'ver el contenido de la página', 'mostrar contenido remoto'],
  },
];
