import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Users, 
  Car, 
  TrendingUp, 
  Phone, 
  Eye, 
  Filter, 
  Calendar, 
  DollarSign,
  Navigation
} from 'lucide-react';
import Papa from 'papaparse';

const DispatcherPanel = () => {
  const [activeTab, setActiveTab] = useState('search');
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [masterData, setMasterData] = useState([]);
  const [routeData, setRouteData] = useState([]);
  const [driverData, setDriverData] = useState([]);
  const [segmentData, setSegmentData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Фильтры и модальные окна
  const [routeFilter, setRouteFilter] = useState(20);
  const [driverFilter, setDriverFilter] = useState(20);
  const [vehicleView, setVehicleView] = useState('brands');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);

  // Загрузка данных через fetch для продакшна
  useEffect(() => {
    const loadData = async () => {
      try {
        // Загружаем CSV данные через fetch
        const [masterResponse, routeResponse, driverResponse, segmentResponse] = await Promise.all([
          fetch('/data/master_clean.csv'),
          fetch('/data/route_summary.csv'),
          fetch('/data/driver_summary.csv'),
          fetch('/data/top30_routes_with_segments.csv')
        ]);

        const masterCsv = await masterResponse.text();
        const masterParsed = Papa.parse(masterCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });
        
        const routeCsv = await routeResponse.text();
        const routeParsed = Papa.parse(routeCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });
        
        const driverCsv = await driverResponse.text();
        const driverParsed = Papa.parse(driverCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });
        
        const segmentCsv = await segmentResponse.text();
        const segmentParsed = Papa.parse(segmentCsv, { header: true, dynamicTyping: true, skipEmptyLines: true });

        setMasterData(masterParsed.data);
        setRouteData(routeParsed.data);
        setDriverData(driverParsed.data);
        setSegmentData(segmentParsed.data);
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Получение уникальных городов
  const cities = useMemo(() => {
    const citySet = new Set();
    masterData.forEach(row => {
      if (row.origin_city) citySet.add(row.origin_city);
      if (row.dest_city) citySet.add(row.dest_city);
    });
    return Array.from(citySet).sort();
  }, [masterData]);

  // Поиск маршрутов
  const searchResults = useMemo(() => {
    if (!searchFrom || !searchTo) return { exact: [], partial: [], zone: [] };
    
    // Точные совпадения
    const exactMatches = routeData.filter(route => 
      route.origin_city?.toLowerCase() === searchFrom.toLowerCase() && 
      route.dest_city?.toLowerCase() === searchTo.toLowerCase()
    );

    // Частичные совпадения через сегменты
    const partialMatches = segmentData.filter(segment => {
      if (!segment.segments) return false;
      const cities = segment.segments.split(' → ');
      const fromIndex = cities.findIndex(city => city.toLowerCase() === searchFrom.toLowerCase());
      const toIndex = cities.findIndex(city => city.toLowerCase() === searchTo.toLowerCase());
      return fromIndex >= 0 && toIndex > fromIndex;
    });

    // Зональные совпадения (водители из тех же городов)
    const zoneMatches = driverData.filter(driver => {
      const driverRoutes = masterData.filter(record => record.driver_name === driver.driver_name);
      return driverRoutes.some(route => 
        route.origin_city?.toLowerCase() === searchFrom.toLowerCase() || 
        route.dest_city?.toLowerCase() === searchTo.toLowerCase()
      );
    }).slice(0, 10);

    return { exact: exactMatches, partial: partialMatches, zone: zoneMatches };
  }, [searchFrom, searchTo, routeData, segmentData, driverData, masterData]);

  // Топ маршруты с фильтром
  const topRoutes = useMemo(() => 
    routeData.sort((a, b) => (b.total_trips || 0) - (a.total_trips || 0)).slice(0, routeFilter),
    [routeData, routeFilter]
  );

  // Топ водители с фильтром
  const topDrivers = useMemo(() => 
    driverData.sort((a, b) => (b.total_trips || 0) - (a.total_trips || 0)).slice(0, driverFilter),
    [driverData, driverFilter]
  );

  // Получение детальной информации о водителе
  const getDriverDetails = (driverName) => {
    const driverTrips = masterData.filter(trip => trip.driver_name === driverName);
    const routes = {};
    
    driverTrips.forEach(trip => {
      const routeKey = `${trip.origin_city} → ${trip.dest_city}`;
      if (!routes[routeKey]) {
        routes[routeKey] = {
          route: routeKey,
          trips: 0,
          prices: [],
          costs: [],
          margins: [],
          lastDate: null
        };
      }
      routes[routeKey].trips++;
      if (trip.price_declared) routes[routeKey].prices.push(trip.price_declared);
      if (trip.route_cost) routes[routeKey].costs.push(trip.route_cost);
      if (trip.margin) routes[routeKey].margins.push(trip.margin);
      if (trip.date && (!routes[routeKey].lastDate || new Date(trip.date) > new Date(routes[routeKey].lastDate))) {
        routes[routeKey].lastDate = trip.date;
      }
    });

    return Object.values(routes).map(route => ({
      ...route,
      avgPrice: route.prices.length ? route.prices.reduce((a, b) => a + b, 0) / route.prices.length : 0,
      avgCost: route.costs.length ? route.costs.reduce((a, b) => a + b, 0) / route.costs.length : 0,
      avgMargin: route.margins.length ? route.margins.reduce((a, b) => a + b, 0) / route.margins.length : 0
    })).sort((a, b) => b.trips - a.trips);
  };

  // Функция для открытия карточки водителя
  const openDriverCard = (driver) => {
    setSelectedDriver(driver);
    setShowDriverModal(true);
  };

  // Форматирование цены
  const formatPrice = (price) => {
    if (!price) return '—';
    return new Intl.NumberFormat('ru-RU').format(Math.round(price)) + ' ₽';
  };

  // Форматирование телефона
  const formatPhone = (phone) => {
    if (!phone) return '—';
    return phone.toString().replace(/(\d{2})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 $2 $3-$4-$5');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка данных диспетчера...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Navigation className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Диспетчер перевозок</h1>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>{masterData.length} рейсов</span>
              <span>{routeData.length} маршрутов</span>
              <span>{driverData.length} водителей</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'search', name: 'Поиск заявки', icon: Search },
              { id: 'routes', name: 'Маршруты', icon: MapPin },
              { id: 'drivers', name: 'Водители', icon: Users },
              { id: 'vehicles', name: 'Автопарк', icon: Car }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Поиск заявки */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Поиск по маршруту</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Откуда</label>
                  <input
                    type="text"
                    value={searchFrom}
                    onChange={(e) => setSearchFrom(e.target.value)}
                    placeholder="Выберите город отправления"
                    list="cities-from"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="cities-from">
                    {cities.map(city => <option key={city} value={city} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Куда</label>
                  <input
                    type="text"
                    value={searchTo}
                    onChange={(e) => setSearchTo(e.target.value)}
                    placeholder="Выберите город назначения"
                    list="cities-to"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="cities-to">
                    {cities.map(city => <option key={city} value={city} />)}
                  </datalist>
                </div>
              </div>
            </div>

            {(searchFrom && searchTo) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Точные совпадения */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-green-700">Точные совпадения</h3>
                    <p className="text-sm text-gray-600">{searchResults.exact.length} маршрутов</p>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    {searchResults.exact.length > 0 ? (
                      <div className="space-y-3">
                        {searchResults.exact.map((route, idx) => (
                          <div key={idx} className="border rounded-lg p-3 hover:bg-gray-50">
                            <div className="font-medium">{route.origin_city} → {route.dest_city}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>Рейсов: {route.total_trips}</div>
                              <div>Водителей: {route.unique_drivers}</div>
                              <div className="text-green-600 font-medium">
                                Ср. цена: {formatPrice(route.avg_declared)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">Точных совпадений не найдено</p>
                    )}
                  </div>
                </div>

                {/* Частичные совпадения */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-blue-700">Частичные совпадения</h3>
                    <p className="text-sm text-gray-600">{searchResults.partial.length} коридоров</p>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    {searchResults.partial.length > 0 ? (
                      <div className="space-y-3">
                        {searchResults.partial.map((segment, idx) => (
                          <div key={idx} className="border rounded-lg p-3 hover:bg-gray-50">
                            <div className="font-medium">{segment.origin_city} → {segment.dest_city}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>Рейсов: {segment.trips}</div>
                              <div className="text-xs mt-2 text-gray-500">
                                Коридор: {segment.segments}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">Частичных совпадений не найдено</p>
                    )}
                  </div>
                </div>

                {/* Зональные совпадения */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-orange-700">По геозоне</h3>
                    <p className="text-sm text-gray-600">{searchResults.zone.length} водителей</p>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    {searchResults.zone.length > 0 ? (
                      <div className="space-y-3">
                        {searchResults.zone.map((driver, idx) => (
                          <div 
                            key={idx} 
                            className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => openDriverCard(driver)}
                          >
                            <div className="font-medium text-blue-600 hover:text-blue-800">{driver.driver_name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>Рейсов: {driver.total_trips}</div>
                              <div>Маршрутов: {driver.unique_routes}</div>
                              <div className="text-orange-600 font-medium">
                                Ср. ставка: {formatPrice(driver.avg_cost)}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              Нажмите для просмотра маршрутов →
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">Подходящих водителей не найдено</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Маршруты */}
        {activeTab === 'routes' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Каталог маршрутов</h2>
                  <p className="text-gray-600">Показано {topRoutes.length} из {routeData.length} маршрутов</p>
                </div>
                <div className="flex space-x-2">
                  {[20, 50, 100, routeData.length].map(count => (
                    <button
                      key={count}
                      onClick={() => setRouteFilter(count)}
                      className={`px-3 py-1 rounded text-sm ${
                        routeFilter === count
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {count === routeData.length ? 'Все' : `Топ-${count}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Маршрут</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Рейсов</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Водителей</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Средняя цена</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Диапазон цен</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Средняя ставка</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topRoutes.map((route, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{route.origin_city} → {route.dest_city}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{route.total_trips || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{route.unique_drivers || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-green-600 font-medium">{formatPrice(route.avg_declared)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                        {formatPrice(route.min_declared)} - {formatPrice(route.max_declared)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-medium">{formatPrice(route.avg_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Водители */}
        {activeTab === 'drivers' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Каталог водителей</h2>
                  <p className="text-gray-600">Показано {topDrivers.length} из {driverData.length} водителей</p>
                </div>
                <div className="flex space-x-2">
                  {[20, 50, 100, driverData.length].map(count => (
                    <button
                      key={count}
                      onClick={() => setDriverFilter(count)}
                      className={`px-3 py-1 rounded text-sm ${
                        driverFilter === count
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {count === driverData.length ? 'Все' : `Топ-${count}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Водитель</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Телефон</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Рейсов</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Маршрутов</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ср. цена</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ср. ставка</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topDrivers.map((driver, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openDriverCard(driver)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-blue-600 hover:text-blue-800">{driver.driver_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                        <div className="flex items-center">
                          <Phone className="h-4 w-4 mr-1" />
                          {formatPhone(driver.driver_phone)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{driver.total_trips || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{driver.unique_routes || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-green-600 font-medium">{formatPrice(driver.avg_declared)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-medium">{formatPrice(driver.avg_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Автопарк */}
        {activeTab === 'vehicles' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Статистика автопарка</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <Car className="h-8 w-8 text-blue-600" />
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-blue-900">{masterData.filter(r => r.brand).length}</div>
                      <div className="text-blue-600">Записей с авто</div>
                    </div>
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <DollarSign className="h-8 w-8 text-green-600" />
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-green-900">
                        {formatPrice(masterData.reduce((sum, r) => sum + (r.price_declared || 0), 0) / masterData.length)}
                      </div>
                      <div className="text-green-600">Средняя цена</div>
                    </div>
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <TrendingUp className="h-8 w-8 text-orange-600" />
                    <div className="ml-4">
                      <div className="text-2xl font-bold text-orange-900">
                        {formatPrice(masterData.reduce((sum, r) => sum + (r.margin || 0), 0) / masterData.length)}
                      </div>
                      <div className="text-orange-600">Средняя маржа</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Выбор типа статистики */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Детальная статистика</h3>
                  <div className="flex space-x-2">
                    {[
                      { id: 'brands', name: 'По брендам' },
                      { id: 'models', name: 'По моделям' },
                      { id: 'source', name: 'По источникам' }
                    ].map(view => (
                      <button
                        key={view.id}
                        onClick={() => setVehicleView(view.id)}
                        className={`px-4 py-2 rounded text-sm ${
                          vehicleView === view.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {view.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6">
                {vehicleView === 'brands' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-4">Популярные бренды</h4>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {Object.entries(
                          masterData.reduce((acc, record) => {
                            if (record.brand) {
                              acc[record.brand] = (acc[record.brand] || 0) + 1;
                            }
                            return acc;
                          }, {})
                        )
                          .sort(([,a], [,b]) => b - a)
                          .map(([brand, count]) => (
                            <div key={brand} className="flex justify-between items-center py-2 border-b border-gray-100">
                              <span className="font-medium">{brand}</span>
                              <div className="text-right">
                                <div className="text-gray-900">{count} рейсов</div>
                                <div className="text-xs text-gray-500">{((count / masterData.length) * 100).toFixed(1)}%</div>
                             </div>
                           </div>
                         ))}
                     </div>
                   </div>
                   <div>
                     <h4 className="font-medium mb-4">Средние цены по брендам</h4>
                     <div className="space-y-2 max-h-96 overflow-y-auto">
                       {Object.entries(
                         masterData.reduce((acc, record) => {
                           if (record.brand && record.price_declared) {
                             if (!acc[record.brand]) {
                               acc[record.brand] = { total: 0, count: 0 };
                             }
                             acc[record.brand].total += record.price_declared;
                             acc[record.brand].count += 1;
                           }
                           return acc;
                         }, {})
                       )
                         .map(([brand, data]) => [brand, data.total / data.count])
                         .sort(([,a], [,b]) => b - a)
                         .map(([brand, avgPrice]) => (
                           <div key={brand} className="flex justify-between items-center py-2 border-b border-gray-100">
                             <span className="font-medium">{brand}</span>
                             <span className="text-green-600 font-medium">{formatPrice(avgPrice)}</span>
                           </div>
                         ))}
                     </div>
                   </div>
                 </div>
               )}

               {vehicleView === 'models' && (
                 <div>
                   <h4 className="font-medium mb-4">Популярные модели</h4>
                   <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                     {Object.entries(
                       masterData.reduce((acc, record) => {
                         if (record.model && record.brand) {
                           const key = `${record.brand} ${record.model}`;
                           if (!acc[key]) {
                             acc[key] = { count: 0, prices: [] };
                           }
                           acc[key].count += 1;
                           if (record.price_declared) {
                             acc[key].prices.push(record.price_declared);
                           }
                         }
                         return acc;
                       }, {})
                     )
                       .sort(([,a], [,b]) => b.count - a.count)
                       .slice(0, 20)
                       .map(([model, data]) => (
                         <div key={model} className="border rounded-lg p-3">
                           <div className="font-medium text-sm">{model}</div>
                           <div className="text-xs text-gray-600 mt-1">
                             <div>{data.count} рейсов</div>
                             {data.prices.length > 0 && (
                               <div className="text-green-600">
                                 Ср: {formatPrice(data.prices.reduce((a, b) => a + b, 0) / data.prices.length)}
                               </div>
                             )}
                           </div>
                         </div>
                       ))}
                   </div>
                 </div>
               )}

               {vehicleView === 'source' && (
                 <div>
                   <h4 className="font-medium mb-4">Источники данных об автомобилях</h4>
                   <div className="space-y-2">
                     {Object.entries(
                       masterData.reduce((acc, record) => {
                         if (record.vehicle_source) {
                           acc[record.vehicle_source] = (acc[record.vehicle_source] || 0) + 1;
                         }
                         return acc;
                       }, {})
                     )
                       .sort(([,a], [,b]) => b - a)
                       .map(([source, count]) => (
                         <div key={source} className="flex justify-between items-center py-3 border-b border-gray-100">
                           <span className="font-medium">{source}</span>
                           <div className="text-right">
                             <div className="text-gray-900">{count} записей</div>
                             <div className="text-xs text-gray-500">{((count / masterData.length) * 100).toFixed(1)}%</div>
                           </div>
                         </div>
                       ))}
                   </div>
                 </div>
               )}
             </div>
           </div>
         </div>
       )}
     </div>

     {/* Модальное окно с карточкой водителя */}
     {showDriverModal && selectedDriver && (
       <div 
         className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
         onClick={() => setShowDriverModal(false)}
       >
         <div 
           className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden"
           onClick={(e) => e.stopPropagation()}
         >
           <div className="p-6 border-b bg-blue-50">
             <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-2xl font-bold text-gray-900">{selectedDriver.driver_name}</h2>
                 <p className="text-gray-600 flex items-center mt-1">
                   <Phone className="h-4 w-4 mr-1" />
                   {formatPhone(selectedDriver.driver_phone)}
                 </p>
               </div>
               <button
                 onClick={() => setShowDriverModal(false)}
                 className="ml-4 bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-800 rounded-full p-2 shadow-md transition-colors flex-shrink-0"
                 title="Закрыть"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               </button>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
               <div className="text-center">
                 <div className="text-2xl font-bold text-blue-600">{selectedDriver.total_trips}</div>
                 <div className="text-sm text-gray-600">Всего рейсов</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-green-600">{selectedDriver.unique_routes}</div>
                 <div className="text-sm text-gray-600">Маршрутов</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-orange-600">{formatPrice(selectedDriver.avg_declared)}</div>
                 <div className="text-sm text-gray-600">Ср. цена</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-purple-600">{formatPrice(selectedDriver.avg_cost)}</div>
                 <div className="text-sm text-gray-600">Ср. ставка</div>
               </div>
             </div>
           </div>
           
           <div className="p-6 overflow-y-auto max-h-[60vh]">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-semibold">Маршруты водителя</h3>
               <button
                 onClick={() => setShowDriverModal(false)}
                 className="text-sm text-gray-500 hover:text-gray-700 underline"
               >
                 Закрыть карточку
               </button>
             </div>
             <div className="space-y-3">
               {getDriverDetails(selectedDriver.driver_name).map((route, idx) => (
                 <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                   <div className="flex justify-between items-start">
                     <div className="flex-1">
                       <h4 className="font-semibold text-lg">{route.route}</h4>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                         <div>
                           <span className="text-gray-600">Рейсов:</span>
                           <span className="ml-2 font-medium">{route.trips}</span>
                         </div>
                         <div>
                           <span className="text-gray-600">Ср. цена:</span>
                           <span className="ml-2 font-medium text-green-600">{formatPrice(route.avgPrice)}</span>
                         </div>
                         <div>
                           <span className="text-gray-600">Ср. ставка:</span>
                           <span className="ml-2 font-medium text-blue-600">{formatPrice(route.avgCost)}</span>
                         </div>
                         <div>
                           <span className="text-gray-600">Ср. маржа:</span>
                           <span className="ml-2 font-medium text-orange-600">{formatPrice(route.avgMargin)}</span>
                         </div>
                       </div>
                       {route.lastDate && (
                         <div className="mt-2 text-sm text-gray-500">
                           Последний рейс: {new Date(route.lastDate).toLocaleDateString('ru-RU')}
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               ))}
             </div>
           </div>
         </div>
       </div>
     )}

     {/* Statistics Footer */}
     <footer className="bg-white border-t mt-12">
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
           <div>
             <div className="text-2xl font-bold text-blue-600">{masterData.length}</div>
             <div className="text-sm text-gray-600">Всего рейсов</div>
           </div>
           <div>
             <div className="text-2xl font-bold text-green-600">{cities.length}</div>
             <div className="text-sm text-gray-600">Городов</div>
           </div>
           <div>
             <div className="text-2xl font-bold text-orange-600">{driverData.length}</div>
             <div className="text-sm text-gray-600">Водителей</div>
           </div>
           <div>
             <div className="text-2xl font-bold text-purple-600">{routeData.length}</div>
             <div className="text-sm text-gray-600">Маршрутов</div>
           </div>
         </div>
       </div>
     </footer>
   </div>
 );
};

export default DispatcherPanel;