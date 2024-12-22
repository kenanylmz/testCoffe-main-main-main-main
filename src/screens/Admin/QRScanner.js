import React, {useEffect, useState} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  BackHandler,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';
import {incrementCoffeeCount, redeemGift} from '../../config/firebase';
import auth from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import {useFocusEffect, useNavigation} from '@react-navigation/native';

const updateCafeStats = async (cafeName, isGift) => {
  const today = new Date().toISOString().split('T')[0];
  const statsRef = database().ref(`cafeStats/${cafeName}/${today}`);

  const snapshot = await statsRef.once('value');
  const currentStats = snapshot.val() || {coffeeCount: 0, giftCount: 0};

  if (isGift) {
    currentStats.giftCount += 1;
  } else {
    currentStats.coffeeCount += 1;
  }

  await statsRef.update(currentStats);
};

const QRScanner = () => {
  const [hasPermission, setHasPermission] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const device = useCameraDevice('back');
  const navigation = useNavigation();

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        navigation.goBack();
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () =>
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [navigation]),
  );

  const handleQRCode = async qrData => {
    try {
      console.log('Okunan QR kod:', qrData); // QR kod içeriğini logla

      let parsedQR;
      try {
        parsedQR = JSON.parse(qrData);
      } catch {
        throw new Error('QR kod geçersiz formatta.');
      }

      // Get current admin's data
      const adminSnapshot = await database()
        .ref(`users/${auth().currentUser.uid}`)
        .once('value');
      const adminData = adminSnapshot.val();

      if (!adminData || !adminData.cafename) {
        throw new Error(
          'Admin kafe ismi tanımlanmamış. Lütfen süper admin ile iletişime geçin.',
        );
      }

      // Check if QR code's cafename matches admin's cafename
      if (parsedQR.cafeName !== adminData.cafename) {
        throw new Error(
          `Bu QR kod ${adminData.cafename} kafesine ait değil. Sadece kendi kafenize ait QR kodları okutabilirsiniz.`,
        );
      }

      // Kupon QR kodu kontrolü
      if (parsedQR.couponId && parsedQR.userId && parsedQR.cafeName) {
        const result = await redeemGift(
          parsedQR.userId,
          parsedQR.cafeName,
          parsedQR.couponId,
        );
        if (result.success) {
          await updateCafeStats(parsedQR.cafeName, true); // Hediye kullanımı
          Alert.alert(
            'Başarılı',
            `${result.userName} Adlı Kullanıcının Bir Adet Hediye Kuponu Kullanılmıştır`,
          );
        } else {
          throw new Error(result.error);
        }
      } else if (parsedQR.userId && parsedQR.cafeName && parsedQR.timestamp) {
        // Kahve QR kodu işleme
        const safeTimestamp = parsedQR.timestamp.replace(/[.:\-]/g, '');

        const result = await incrementCoffeeCount(
          parsedQR.userId,
          parsedQR.cafeName,
          {
            userId: parsedQR.userId,
            cafeName: parsedQR.cafeName,
            timestamp: safeTimestamp,
          },
        );
        if (result.success) {
          await updateCafeStats(parsedQR.cafeName, false); // Normal kahve satışı
          Alert.alert(
            'Başarılı',
            result.hasGift
              ? `5 kahve tamamlandı! Hediye kazanıldı!`
              : `Kahve sayısı: ${result.coffeeCount}/5`,
            [{text: 'Tamam'}],
          );
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error(
          'QR kod geçersiz formatta. Lütfen Müdavim sayfasından yeni bir QR kod oluşturun.',
        );
      }
    } catch (error) {
      // Sadece Alert göster, loglama yapma
      Alert.alert('Hata', error.message, [{text: 'Tamam'}]);
    } finally {
      // 2 saniye sonra yeni taramaya izin ver
      setTimeout(() => {
        setIsScanning(true);
      }, 2000);
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (codes.length > 0 && isScanning) {
        setIsScanning(false);
        handleQRCode(codes[0].value);
      }
    },
  });

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const cameraPermission = await Camera.requestCameraPermission();
    setHasPermission(cameraPermission === 'granted');
  };

  const requestPermission = async () => {
    await checkPermission();
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Kamera izni kontrolü yapılıyor...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Kamera kullanımı için izin gerekli</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>İzin Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Kamera bulunamadı</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 16,
    color: '#4A3428',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#4A3428',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanArea: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#4A3428',
    backgroundColor: 'transparent',
  },
});

export default QRScanner;
