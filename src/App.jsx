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
          fetch('/data/gotovie_dannie.csv'),
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

  // Получение уникальных городов из нового формата
  const cities = useMemo(() => {
    const citySet = new Set();
    masterData.forEach(row => {
      // Извлекаем города из полей "Откуда полный" и "Куда полный"
      if (row['Откуда полный']) {
        // Берем первое слово как город
        const city = row['Откуда полный'].split(',')[0].split(' ')[0];
        if (city) citySet.add(city.trim());
      }
      if (row['Куда полный']) {
        const city = row['Куда полный'].split(',')[0].split(' ')[0];
        if (city) citySet.add(city.trim());
      }
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
      const driverRoutes = masterData.filter(record => record['Водитель'] === driver.driver_name);
      return driverRoutes.some(route => {
        const originCity = route['Откуда полный']?.split(',')[0].split(' ')[0]?.trim();
        const destCity = route['Куда полный']?.split(',')[0].split(' ')[0]?.trim();
        return originCity?.toLowerCase() === searchFrom.toLowerCase() || 
               destCity?.toLowerCase() === searchTo.toLowerCase();
      });
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
    const driverTrips = masterData.filter(trip => trip['Водитель'] === driverName);
    const routes = {};
    
    driverTrips.forEach(trip => {
      const originCity = trip['Откуда полный']?.split(',')[0].split(' ')[0]?.trim();
      const destCity = trip['Куда полный']?.split(',')[0].split(' ')[0]?.trim();
      const routeKey = `${originCity} → ${destCity}`;
      
      if (!routes[routeKey]) {
        routes[routeKey] = {
          route: routeKey,
          origin_city: originCity,
          dest_city: destCity,
          trips: 0,
          prices: [],
          costs: [],
          lastDate: null,
          cities: []
        };
      }
      routes[routeKey].trips++;
      if (trip['ОБЪЯВЛЕННАЯ ЦЕНА']) routes[routeKey].prices.push(trip['ОБЪЯВЛЕННАЯ ЦЕНА']);
      if (trip['СЕБЕСТОИМОСТЬ МАРШРУТА']) routes[routeKey].costs.push(trip['СЕБЕСТОИМОСТЬ МАРШРУТА']);
      if (trip['Дата создания'] && (!routes[routeKey].lastDate || new Date(trip['Дата создания']) > new Date(routes[routeKey].lastDate))) {
        routes[routeKey].lastDate = trip['Дата создания'];
      }
    });

    // Добавляем информацию о городах из сегментов
    Object.values(routes).forEach(route => {
      const segment = segmentData.find(s => 
        s.origin_city === route.origin_city && s.dest_city === route.dest_city
      );
      if (segment && segment.segments) {
        route.cities = segment.segments.split(' → ');
      } else {
        route.cities = [route.origin_city, route.dest_city];
      }
    });

    return Object.values(routes).map(route => ({
      ...route,
      avgPrice: route.prices.length ? route.prices.reduce((a, b) => a + b, 0) / route.prices.length : 0,
      avgCost: route.costs.length ? route.costs.reduce((a, b) => a + b, 0) / route.costs.length : 0,
      avgMargin: route.prices.length && route.costs.length ? 
        (route.prices.reduce((a, b) => a + b, 0) - route.costs.reduce((a, b) => a + b, 0)) / route.prices.length : 0
    })).sort((a, b) => b.trips - a.trips);
  };

  // Функция для открытия карточки водителя
  const openDriverCard = (driver) => {
    setSelectedDriver(driver);
    setShowDriverModal(true);
  };

  // Функция для открытия карточки маршрута
  const openRouteCard = (route) => {
    setSelectedRoute(route);
    setShowRouteModal(true);
  };

  // Получение детальной информации о маршруте
  const getRouteDetails = (originCity, destCity) => {
    const routeTrips = masterData.filter(trip => {
      const tripOrigin = trip['Откуда полный']?.split(',')[0].split(' ')[0]?.trim();
      const tripDest = trip['Куда полный']?.split(',')[0].split(' ')[0]?.trim();
      return tripOrigin === originCity && tripDest === destCity;
    });
    
    const drivers = {};
    const cities = new Set([originCity]);
    
    routeTrips.forEach(trip => {
      // Собираем водителей
      if (!drivers[trip['Водитель']]) {
        drivers[trip['Водитель']] = {
          driver_name: trip['Водитель'],
          driver_phone: trip['Номер телефона'],
          trips: 0,
          prices: [],
          costs: [],
          lastDate: null,
          vehicles: new Set()
        };
      }
      drivers[trip['Водитель']].trips++;
      if (trip['ОБЪЯВЛЕННАЯ ЦЕНА']) drivers[trip['Водитель']].prices.push(trip['ОБЪЯВЛЕННАЯ ЦЕНА']);
      if (trip['СЕБЕСТОИМОСТЬ МАРШРУТА']) drivers[trip['Водитель']].costs.push(trip['СЕБЕСТОИМОСТЬ МАРШРУТА']);
      if (trip['Марка'] && trip['Модель']) drivers[trip['Водитель']].vehicles.add(`${trip['Марка']} ${trip['Модель']}`);
      if (trip['Дата создания'] && (!drivers[trip['Водитель']].lastDate || new Date(trip['Дата создания']) > new Date(drivers[trip['Водитель']].lastDate))) {
        drivers[trip['Водитель']].lastDate = trip['Дата создания'];
      }
    });

    // Ищем промежуточные города из сегментов
    const routeSegment = segmentData.find(segment => 
      segment.origin_city === originCity && segment.dest_city === destCity
    );
    
    if (routeSegment && routeSegment.segments) {
      const segmentCities = routeSegment.segments.split(' → ');
      segmentCities.forEach(city => cities.add(city));
    }
    
    cities.add(destCity);

    return {
      drivers: Object.values(drivers).map(driver => ({
        ...driver,
        vehicles: Array.from(driver.vehicles),
        avgPrice: driver.prices.length ? driver.prices.reduce((a, b) => a + b, 0) / driver.prices.length : 0,
        avgCost: driver.costs.length ? driver.costs.reduce((a, b) => a + b, 0) / driver.costs.length : 0,
        avgMargin: driver.prices.length && driver.costs.length ? 
          (driver.prices.reduce((a, b) => a + b, 0) - driver.costs.reduce((a, b) => a + b, 0)) / driver.prices.length : 0
      })).sort((a, b) => b.trips - a.trips),
      cities: Array.from(cities),
      totalTrips: routeTrips.length
    };
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
                          <div 
                            key={idx} 
                            className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => openRouteCard(route)}
                          >
                            <div className="font-medium text-blue-600 hover:text-blue-800">{route.origin_city} → {route.dest_city}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>Рейсов: {route.total_trips}</div>
                              <div>Водителей: {route.unique_drivers}</div>
                              <div className="text-green-600 font-medium">
                                Ср. стоимость: {formatPrice(route.avg_cost)}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              Нажмите для просмотра деталей →
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
                                Ср. стоимость: {formatPrice(driver.avg_cost)}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Средняя стоимость</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Диапазон стоимости</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Общая стоимость</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topRoutes.map((route, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openRouteCard(route)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-blue-600 hover:text-blue-800">{route.origin_city} → {route.dest_city}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{route.total_trips || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900">{route.unique_drivers || 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-green-600 font-medium">{formatPrice(route.avg_cost)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                        {formatPrice(route.min_cost)} - {formatPrice(route.max_cost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-medium">{formatPrice(route.total_cost)}</td>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Средняя стоимость</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Общая стоимость</th>
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
                     <td className="px-6 py-4 whitespace-nowrap text-green-600 font-medium">{formatPrice(driver.avg_cost)}</td>
                     <td className="px-6 py-4 whitespace-nowrap text-blue-600 font-medium">{formatPrice(driver.total_cost)}</td>
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
                     <div className="text-2xl font-bold text-blue-900">{masterData.filter(r => r['Марка']).length}</div>
                     <div className="text-blue-600">Записей с авто</div>
                   </div>
                 </div>
               </div>
               <div className="bg-green-50 rounded-lg p-4">
                 <div className="flex items-center">
                   <DollarSign className="h-8 w-8 text-green-600" />
                   <div className="ml-4">
                     <div className="text-2xl font-bold text-green-900">
                       {formatPrice(masterData.reduce((sum, r) => sum + (r['ОБЪЯВЛЕННАЯ ЦЕНА'] || 0), 0) / masterData.length)}
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
                       {formatPrice(masterData.reduce((sum, r) => sum + (r['СЕБЕСТОИМОСТЬ МАРШРУТА'] || 0), 0) / masterData.length)}
                     </div>
                     <div className="text-orange-600">Средняя себестоимость</div>
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
                     { id: 'routes', name: 'По маршрутам' }
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
                           if (record['Марка']) {
                             acc[record['Марка']] = (acc[record['Марка']] || 0) + 1;
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
                           if (record['Марка'] && record['ОБЪЯВЛЕННАЯ ЦЕНА']) {
                             if (!acc[record['Марка']]) {
                               acc[record['Марка']] = { total: 0, count: 0 };
                             }
                             acc[record['Марка']].total += record['ОБЪЯВЛЕННАЯ ЦЕНА'];
                             acc[record['Марка']].count += 1;
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
                         if (record['Модель'] && record['Марка']) {
                           const key = `${record['Марка']} ${record['Модель']}`;
                           if (!acc[key]) {
                             acc[key] = { count: 0, prices: [] };
                           }
                           acc[key].count += 1;
                           if (record['ОБЪЯВЛЕННАЯ ЦЕНА']) {
                             acc[key].prices.push(record['ОБЪЯВЛЕННАЯ ЦЕНА']);
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

               {vehicleView === 'routes' && (
                 <div>
                   <h4 className="font-medium mb-4">Статистика по маршрутам</h4>
                   <div className="space-y-2">
                     {Object.entries(
                       masterData.reduce((acc, record) => {
                         if (record['Маршрут']) {
                           if (!acc[record['Маршрут']]) {
                             acc[record['Маршрут']] = { count: 0, totalPrice: 0, totalCost: 0 };
                           }
                           acc[record['Маршрут']].count += 1;
                           if (record['ОБЪЯВЛЕННАЯ ЦЕНА']) acc[record['Маршрут']].totalPrice += record['ОБЪЯВЛЕННАЯ ЦЕНА'];
                           if (record['СЕБЕСТОИМОСТЬ МАРШРУТА']) acc[record['Маршрут']].totalCost += record['СЕБЕСТОИМОСТЬ МАРШРУТА'];
                         }
                         return acc;
                       }, {})
                     )
                       .sort(([,a], [,b]) => b.count - a.count)
                       .slice(0, 10)
                       .map(([route, data]) => (
                         <div key={route} className="flex justify-between items-center py-3 border-b border-gray-100">
                           <span className="font-medium">{route}</span>
                           <div className="text-right">
                             <div className="text-gray-900">{data.count} рейсов</div>
                             <div className="text-xs text-green-600">
                               Ср. цена: {formatPrice(data.totalPrice / data.count)}
                             </div>
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
                 <div className="text-2xl font-bold text-orange-600">{formatPrice(selectedDriver.avg_cost)}</div>
                 <div className="text-sm text-gray-600">Ср. стоимость</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-purple-600">{formatPrice(selectedDriver.total_cost)}</div>
                 <div className="text-sm text-gray-600">Общая стоимость</div>
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
                 <div key={idx} className="border border-gray-200 rounded-xl p-6 hover:bg-gray-50 transition-colors">
                   <div className="flex justify-between items-start mb-4">
                     <div className="flex-1">
                       <h4 className="text-xl font-bold text-gray-900 mb-2">{route.route}</h4>
                       
                       {/* Визуализация маршрута */}
                       <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 mb-4">
                         <h5 className="text-sm font-semibold text-gray-700 mb-3">Маршрут через {route.cities.length} городов:</h5>
                         
                         {/* Компактное отображение маршрута */}
                         <div className="flex items-center justify-between">
                           {/* Начальный город */}
                           <div className="flex flex-col items-center min-w-0">
                             <div className="w-4 h-4 bg-green-500 rounded-full shadow-sm"></div>
                             <div className="mt-2 px-3 py-1 bg-white rounded-full shadow-sm border text-sm font-semibold text-gray-800 text-center">
                               {route.cities[0]}
                             </div>
                             <div className="text-xs text-green-600 mt-1 font-medium">Старт</div>
                           </div>

                           {/* Линия прогресса с промежуточными городами */}
                           <div className="flex-1 mx-4">
                             <div className="relative">
                               {/* Линия маршрута */}
                               <div className="absolute top-2 left-0 right-0 h-0.5 bg-gradient-to-r from-green-400 to-red-400"></div>
                               
                               {/* Промежуточные города */}
                               {route.cities.length > 2 && (
                                 <div className="relative flex justify-center">
                                   <div className="bg-white rounded-lg shadow-md border px-3 py-2 max-w-xs">
                                     <div className="text-xs text-gray-600 text-center">
                                       <span className="font-medium text-blue-600">{route.cities.length - 2}</span> промежуточных городов
                                     </div>
                                     <div className="text-xs text-gray-500 mt-1 text-center">
                                       {route.cities.slice(1, -1).length <= 3 ? (
                                         // Показываем все города если их мало
                                         route.cities.slice(1, -1).join(' → ')
                                       ) : (
                                         // Показываем первые 2 и последний с многоточием
                                         `${route.cities[1]} → ${route.cities[2]} → ... → ${route.cities[route.cities.length - 2]}`
                                       )}
                                     </div>
                                   </div>
                                   {/* Точка на линии */}
                                   <div className="absolute top-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full"></div>
                                 </div>
                               )}
                             </div>
                           </div>

                           {/* Конечный город */}
                           <div className="flex flex-col items-center min-w-0">
                             <div className="w-4 h-4 bg-red-500 rounded-full shadow-sm"></div>
                             <div className="mt-2 px-3 py-1 bg-white rounded-full shadow-sm border text-sm font-semibold text-gray-800 text-center">
                               {route.cities[route.cities.length - 1]}
                             </div>
                             <div className="text-xs text-red-600 mt-1 font-medium">Финиш</div>
                           </div>
                         </div>

                         {/* Детальный список городов (сворачиваемый) */}
                         {route.cities.length > 3 && (
                           <details className="mt-4">
                             <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 font-medium">
                               Показать все города маршрута ({route.cities.length})
                             </summary>
                             <div className="mt-3 flex flex-wrap gap-1">
                               {route.cities.map((city, cityIdx) => (
                                 <span
                                   key={cityIdx}
                                   className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                     cityIdx === 0 ? 'bg-green-100 text-green-800' :
                                     cityIdx === route.cities.length - 1 ? 'bg-red-100 text-red-800' :
                                     'bg-blue-100 text-blue-800'
                                   }`}
                                 >
                                   {cityIdx === 0 && '🟢 '}
                                   {cityIdx === route.cities.length - 1 && '🔴 '}
                                   {cityIdx > 0 && cityIdx < route.cities.length - 1 && '🔵 '}
                                   {city}
                                 </span>
                               ))}
                             </div>
                           </details>
                         )}
                       </div>

                       {/* Статистика */}
                       <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                         <div className="bg-blue-50 rounded-lg p-3 text-center">
                           <div className="text-lg font-bold text-blue-700">{route.trips}</div>
                           <div className="text-xs text-blue-600">Рейсов</div>
                         </div>
                         <div className="bg-green-50 rounded-lg p-3 text-center">
                           <div className="text-lg font-bold text-green-700">{formatPrice(route.avgPrice)}</div>
                           <div className="text-xs text-green-600">Ср. цена</div>
                         </div>
                         <div className="bg-purple-50 rounded-lg p-3 text-center">
                           <div className="text-lg font-bold text-purple-700">{formatPrice(route.avgCost)}</div>
                           <div className="text-xs text-purple-600">Ср. стоимость</div>
                         </div>
                         <div className="bg-orange-50 rounded-lg p-3 text-center">
                           <div className="text-lg font-bold text-orange-700">{formatPrice(route.avgMargin)}</div>
                           <div className="text-xs text-orange-600">Ср. маржа</div>
                         </div>
                       </div>

                       {route.lastDate && (
                         <div className="mt-3 flex items-center text-sm text-gray-500">
                           <Calendar className="h-4 w-4 mr-2" />
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

     {/* Модальное окно с карточкой маршрута */}
     {showRouteModal && selectedRoute && (
       <div 
         className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
         onClick={() => setShowRouteModal(false)}
       >
         <div 
           className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden"
           onClick={(e) => e.stopPropagation()}
         >
           <div className="p-6 border-b bg-green-50">
             <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-2xl font-bold text-gray-900">{selectedRoute.origin_city} → {selectedRoute.dest_city}</h2>
                 <p className="text-gray-600 mt-1">Детальная информация о маршруте</p>
               </div>
               <button
                 onClick={() => setShowRouteModal(false)}
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
                 <div className="text-2xl font-bold text-blue-600">{selectedRoute.total_trips}</div>
                 <div className="text-sm text-gray-600">Всего рейсов</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-green-600">{selectedRoute.unique_drivers}</div>
                 <div className="text-sm text-gray-600">Водителей</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-orange-600">{formatPrice(selectedRoute.avg_cost)}</div>
                 <div className="text-sm text-gray-600">Ср. стоимость</div>
               </div>
               <div className="text-center">
                 <div className="text-2xl font-bold text-purple-600">{formatPrice(selectedRoute.total_cost)}</div>
                 <div className="text-sm text-gray-600">Общая стоимость</div>
               </div>
             </div>
           </div>
           
           <div className="p-6 overflow-y-auto max-h-[70vh]">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Города по маршруту */}
               <div>
                 <div className="flex justify-between items-center mb-4">
                   <h3 className="text-lg font-semibold">Города по маршруту</h3>
                 </div>
                 <div className="bg-gray-50 rounded-lg p-4">
                   <div className="space-y-3">
                     {getRouteDetails(selectedRoute.origin_city, selectedRoute.dest_city).cities.map((city, idx) => (
                       <div key={idx} className="flex items-center">
                         <div className="flex-shrink-0">
                           {idx === 0 ? (
                             <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                           ) : idx === getRouteDetails(selectedRoute.origin_city, selectedRoute.dest_city).cities.length - 1 ? (
                             <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                           ) : (
                             <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                           )}
                         </div>
                         <div className="ml-3">
                           <div className="font-medium text-gray-900">{city}</div>
                           <div className="text-xs text-gray-500">
                             {idx === 0 ? 'Отправление' : 
                              idx === getRouteDetails(selectedRoute.origin_city, selectedRoute.dest_city).cities.length - 1 ? 'Назначение' : 
                              'Промежуточный город'}
                           </div>
                         </div>
                         {idx < getRouteDetails(selectedRoute.origin_city, selectedRoute.dest_city).cities.length - 1 && (
                           <div className="ml-3 text-gray-400">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                             </svg>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 </div>
               </div>

               {/* Водители на маршруте */}
               <div>
                 <h3 className="text-lg font-semibold mb-4">Водители на маршруте</h3>
                 <div className="space-y-3 max-h-96 overflow-y-auto">
                   {getRouteDetails(selectedRoute.origin_city, selectedRoute.dest_city).drivers.map((driver, idx) => (
                     <div key={idx} className="border rounded-lg p-3 hover:bg-gray-50">
                       <div className="flex justify-between items-start">
                         <div className="flex-1">
                           <h4 className="font-semibold text-gray-900">{driver.driver_name}</h4>
                           <div className="text-sm text-gray-600 mt-1">
                             <div className="flex items-center">
                               <Phone className="h-3 w-3 mr-1" />
                               {formatPhone(driver.driver_phone)}
                             </div>
                           </div>
                           <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                             <div>
                               <span className="text-gray-600">Рейсов:</span>
                               <span className="ml-2 font-medium">{driver.trips}</span>
                             </div>
                             <div>
                               <span className="text-gray-600">Ср. цена:</span>
                               <span className="ml-2 font-medium text-green-600">{formatPrice(driver.avgPrice)}</span>
                             </div>
                           </div>
                           {driver.vehicles.length > 0 && (
                             <div className="mt-2 text-xs text-gray-500">
                               Авто: {driver.vehicles.slice(0, 2).join(', ')}
                               {driver.vehicles.length > 2 && ` +${driver.vehicles.length - 2}`}
                             </div>
                           )}
                           {driver.lastDate && (
                             <div className="mt-1 text-xs text-gray-500">
                               Последний рейс: {new Date(driver.lastDate).toLocaleDateString('ru-RU')}
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
